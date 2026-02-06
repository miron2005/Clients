#!/usr/bin/env bash
set -euo pipefail
set +H 2>/dev/null || true

API_BASE="${API_BASE:-http://localhost:3001}"
TENANT="${TENANT:-lime}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Нужна команда: $1"; exit 1; }; }
need curl
need node

DATE="$(node -e '
  const d=new Date();
  for(let i=1;i<=14;i++){
    const x=new Date(d); x.setDate(x.getDate()+i);
    const wd=x.getDay(); // 0 Sun .. 6 Sat
    if(wd>=1 && wd<=5){ console.log(x.toISOString().slice(0,10)); process.exit(0); }
  }
  process.exit(2);
')"

echo "API_BASE=$API_BASE"
echo "TENANT=$TENANT"
echo "DATE=$DATE (ближайший будний день)"

SERVICE_ID="$(curl -sS "$API_BASE/public/$TENANT/services" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j.services?.length){ console.error("Нет услуг"); process.exit(2)}; console.log(j.services[0].id);')"
echo "SERVICE_ID=$SERVICE_ID"

STAFF_ID="$(curl -sS "$API_BASE/public/$TENANT/staff?serviceId=$SERVICE_ID" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j.staff?.length){ console.error("Нет staff"); process.exit(2)}; console.log(j.staff[0].id);')"
echo "STAFF_ID=$STAFF_ID"

SLOT_START="$(curl -sS "$API_BASE/public/$TENANT/slots?serviceId=$SERVICE_ID&staffId=$STAFF_ID&date=$DATE" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j.slots?.length){ console.error("Нет слотов на дату"); process.exit(2)}; console.log(j.slots[0].startAt);')"
echo "SLOT_START=$SLOT_START"

HOLD_JSON="$(curl -sS -X POST "$API_BASE/public/$TENANT/holds" \
  -H "content-type: application/json" \
  -d "{\"serviceId\":\"$SERVICE_ID\",\"staffId\":\"$STAFF_ID\",\"startAt\":\"$SLOT_START\",\"clientPhone\":\"+48111111111\"}")"

HOLD_ID="$(echo "$HOLD_JSON" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j.holdId){ console.error(j); process.exit(2)}; console.log(j.holdId);')"
EXPIRES_AT="$(echo "$HOLD_JSON" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.expiresAt||"");')"

echo "HOLD_ID=$HOLD_ID"
echo "EXPIRES_AT=$EXPIRES_AT"

BOOK_JSON="$(curl -sS -X POST "$API_BASE/public/$TENANT/bookings" \
  -H "content-type: application/json" \
  -d "{\"holdId\":\"$HOLD_ID\",\"clientName\":\"Тестовый Клиент\",\"clientPhone\":\"+48111111111\",\"consentMarketing\":true,\"notes\":\"smoke\"}")"

echo "$BOOK_JSON" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log("BOOKING_ID="+j.booking?.id); console.log("STATUS="+j.booking?.status); console.log("START="+j.booking?.startAt); console.log("SERVICE="+j.booking?.serviceName); console.log("STAFF="+j.booking?.staffName);'

# Admin API: login + list bookings
TOKEN="$(curl -sS -X POST "$API_BASE/auth/login" \
  -H "content-type: application/json" \
  -H "x-tenant: $TENANT" \
  -d '{"email":"admin@lime.local","password":"Admin123!"}' | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j.accessToken){ console.error("Login failed", j); process.exit(2)}; console.log(j.accessToken);')"

FROM="$(node -e 'console.log(new Date(Date.now()-7*864e5).toISOString())')"
TO="$(node -e 'console.log(new Date(Date.now()+7*864e5).toISOString())')"

COUNT="$(curl -sS "$API_BASE/admin/bookings?from=$(node -e "console.log(encodeURIComponent('$FROM'))")&to=$(node -e "console.log(encodeURIComponent('$TO'))")" \
  -H "authorization: Bearer $TOKEN" \
  -H "x-tenant: $TENANT" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(Array.isArray(j)?j.length:0);')"

echo "ADMIN_BOOKINGS_COUNT(range -7d..+7d)=$COUNT"
echo "[OK] Smoke test finished."
