"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const date_fns_1 = require("date-fns");
const prisma = new client_1.PrismaClient();
function moneyToCents(value) {
    // Для RUB это "копейки" (value в рублях).
    return Math.round(value * 100);
}
function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}
async function upsertUser(email, name, password) {
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.upsert({
        where: { email },
        update: { name, passwordHash, isActive: true },
        create: { email, name, passwordHash, isActive: true }
    });
}
async function main() {
    // 1) Tenant (РФ: RUB + Europe/Moscow)
    const tenant = await prisma.tenant.upsert({
        where: { slug: "lime" },
        update: { name: "Демо-салон «Лайм»", timezone: "Europe/Moscow", currency: "RUB" },
        create: { name: "Демо-салон «Лайм»", slug: "lime", timezone: "Europe/Moscow", currency: "RUB" }
    });
    // 2) Users
    const admin = await upsertUser("admin@lime.local", "Администратор", "Admin123!");
    const master1 = await upsertUser("master1@lime.local", "Мария", "Master123!");
    const master2 = await upsertUser("master2@lime.local", "Алексей", "Master123!");
    // 3) Memberships
    await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
        update: { role: "owner" },
        create: { tenantId: tenant.id, userId: admin.id, role: "owner" }
    });
    await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: master1.id } },
        update: { role: "staff" },
        create: { tenantId: tenant.id, userId: master1.id, role: "staff" }
    });
    await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: master2.id } },
        update: { role: "staff" },
        create: { tenantId: tenant.id, userId: master2.id, role: "staff" }
    });
    // 4) Staff profiles
    const staffMaria = await prisma.staffProfile.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: master1.id } },
        update: { displayName: "Мария", isActive: true },
        create: { tenantId: tenant.id, userId: master1.id, displayName: "Мария", isActive: true }
    });
    const staffAlexey = await prisma.staffProfile.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: master2.id } },
        update: { displayName: "Алексей", isActive: true },
        create: { tenantId: tenant.id, userId: master2.id, displayName: "Алексей", isActive: true }
    });
    // 5) Services (цены в RUB)
    const servicesSeed = [
        { name: "Стрижка мужская", durationMinutes: 45, price: 1500 },
        { name: "Стрижка женская", durationMinutes: 60, price: 2500 },
        { name: "Маникюр", durationMinutes: 60, price: 2000 },
        { name: "Окрашивание", durationMinutes: 120, price: 6000 }
    ];
    const services = [];
    for (const s of servicesSeed) {
        const created = await prisma.service.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name: s.name } },
            update: { durationMinutes: s.durationMinutes, priceCents: moneyToCents(s.price), isActive: true, currency: "RUB" },
            create: {
                tenantId: tenant.id,
                name: s.name,
                durationMinutes: s.durationMinutes,
                priceCents: moneyToCents(s.price),
                currency: "RUB",
                isActive: true
            }
        });
        services.push(created);
    }
    // 6) Availability rules: Mon–Fri 10:00–19:00, lunch 14:00–15:00
    const weekdays = [1, 2, 3, 4, 5];
    for (const staff of [staffMaria, staffAlexey]) {
        for (const wd of weekdays) {
            await prisma.availabilityRule.upsert({
                where: { tenantId_staffId_weekday: { tenantId: tenant.id, staffId: staff.id, weekday: wd } },
                update: {
                    startMinute: timeToMinutes("10:00"),
                    endMinute: timeToMinutes("19:00"),
                    breakStartMinute: timeToMinutes("14:00"),
                    breakEndMinute: timeToMinutes("15:00")
                },
                create: {
                    tenantId: tenant.id,
                    staffId: staff.id,
                    weekday: wd,
                    startMinute: timeToMinutes("10:00"),
                    endMinute: timeToMinutes("19:00"),
                    breakStartMinute: timeToMinutes("14:00"),
                    breakEndMinute: timeToMinutes("15:00")
                }
            });
        }
    }
    // 7) Clients (+7, без пробелов — чтобы ключ tenantId_phone был чистый)
    const clientsSeed = [
        { fullName: "Ирина Петрова", phone: "+79000000001", consent: true },
        { fullName: "Олег Смирнов", phone: "+79000000002", consent: true },
        { fullName: "Анна Иванова", phone: "+79000000003", consent: false }
    ];
    const clients = [];
    for (const c of clientsSeed) {
        const client = await prisma.client.upsert({
            where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
            update: { fullName: c.fullName, consentMarketing: c.consent, consentAt: c.consent ? new Date() : null },
            create: {
                tenantId: tenant.id,
                fullName: c.fullName,
                phone: c.phone,
                consentMarketing: c.consent,
                consentAt: c.consent ? new Date() : null
            }
        });
        clients.push(client);
    }
    // 8) Finance categories
    const categories = ["Услуги", "Расходники", "Аренда", "Зарплата"];
    const categoryMap = {};
    for (const name of categories) {
        const cat = await prisma.ledgerCategory.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name } },
            update: {},
            create: { tenantId: tenant.id, name }
        });
        categoryMap[name] = cat.id;
    }
    // 9) Demo ledger transactions (RUB)
    const now = new Date();
    await prisma.ledgerTransaction.createMany({
        data: [
            {
                tenantId: tenant.id,
                categoryId: categoryMap["Услуги"],
                type: client_1.LedgerType.income,
                amountCents: moneyToCents(12000),
                currency: "RUB",
                occurredAt: (0, date_fns_1.subDays)(now, 3),
                description: "Выручка за день (демо)"
            },
            {
                tenantId: tenant.id,
                categoryId: categoryMap["Расходники"],
                type: client_1.LedgerType.expense,
                amountCents: moneyToCents(1850),
                currency: "RUB",
                occurredAt: (0, date_fns_1.subDays)(now, 2),
                description: "Покупка расходников (демо)"
            },
            {
                tenantId: tenant.id,
                categoryId: categoryMap["Аренда"],
                type: client_1.LedgerType.expense,
                amountCents: moneyToCents(6000),
                currency: "RUB",
                occurredAt: (0, date_fns_1.subDays)(now, 1),
                description: "Часть аренды (демо)"
            }
        ],
        skipDuplicates: true
    });
    // 10) Payroll rules
    await prisma.payrollRule.createMany({
        data: [
            {
                tenantId: tenant.id,
                staffId: staffMaria.id,
                ruleType: client_1.PayrollRuleType.percent,
                percentBps: 3000,
                isActive: true
            },
            {
                tenantId: tenant.id,
                staffId: staffAlexey.id,
                ruleType: client_1.PayrollRuleType.mixed,
                percentBps: 2500,
                monthlyFixedCents: moneyToCents(60000),
                isActive: true
            }
        ],
        skipDuplicates: true
    });
    // 11) Message templates (RU)
    const templates = [
        {
            key: "booking_confirmation",
            title: "Подтверждение записи",
            body: "Здравствуйте, {clientName}! Вы записаны на услугу «{serviceName}» {dateTime} к мастеру {staffName}. Стоимость: {price}."
        },
        {
            key: "reminder_24h",
            title: "Напоминание за 24 часа",
            body: "Напоминаем: завтра {dateTime} у вас запись на «{serviceName}» к мастеру {staffName}. Если планы изменились — ответьте на это сообщение."
        },
        {
            key: "reminder_2h",
            title: "Напоминание за 2 часа",
            body: "Скоро встречаемся! Через 2 часа ({dateTime}) запись на «{serviceName}» к мастеру {staffName}. Ждём вас 🙂"
        },
        {
            key: "cancellation",
            title: "Отмена записи",
            body: "Запись на «{serviceName}» {dateTime} отменена. Если хотите перенести — выберите новое время на сайте."
        }
    ];
    for (const t of templates) {
        for (const ch of [client_1.MessageChannel.telegram, client_1.MessageChannel.whatsapp]) {
            await prisma.messageTemplate.upsert({
                where: { tenantId_key_channel: { tenantId: tenant.id, key: t.key, channel: ch } },
                update: { title: t.title, body: t.body, isActive: true },
                create: {
                    tenantId: tenant.id,
                    key: t.key,
                    channel: ch,
                    title: t.title,
                    body: t.body,
                    isActive: true
                }
            });
        }
    }
    // 12) Demo bookings: 3 upcoming + 2 past
    const serviceMen = services.find(s => s.name === "Стрижка мужская");
    const serviceWomen = services.find(s => s.name === "Стрижка женская");
    const serviceMani = services.find(s => s.name === "Маникюр");
    const serviceColor = services.find(s => s.name === "Окрашивание");
    const today0 = (0, date_fns_1.startOfDay)(new Date());
    const d1 = (0, date_fns_1.addDays)(today0, 1);
    const d2 = (0, date_fns_1.addDays)(today0, 2);
    const d3 = (0, date_fns_1.addDays)(today0, 3);
    const past1 = (0, date_fns_1.subDays)(today0, 5);
    const past2 = (0, date_fns_1.subDays)(today0, 12);
    function atDay(day, hh, mm) {
        return (0, date_fns_1.setMinutes)((0, date_fns_1.setHours)(day, hh), mm);
    }
    await prisma.booking.deleteMany({
        where: {
            tenantId: tenant.id,
            startAt: { gte: (0, date_fns_1.subDays)(today0, 30), lte: (0, date_fns_1.addDays)(today0, 30) }
        }
    });
    await prisma.booking.createMany({
        data: [
            {
                tenantId: tenant.id,
                serviceId: serviceMen.id,
                staffId: staffMaria.id,
                clientId: clients[0].id,
                startAt: atDay(d1, 11, 0),
                endAt: atDay(d1, 11, 45),
                status: client_1.BookingStatus.planned,
                priceCents: serviceMen.priceCents,
                currency: "RUB",
                notes: "Демо-запись"
            },
            {
                tenantId: tenant.id,
                serviceId: serviceMani.id,
                staffId: staffAlexey.id,
                clientId: clients[1].id,
                startAt: atDay(d2, 16, 0),
                endAt: atDay(d2, 17, 0),
                status: client_1.BookingStatus.planned,
                priceCents: serviceMani.priceCents,
                currency: "RUB"
            },
            {
                tenantId: tenant.id,
                serviceId: serviceColor.id,
                staffId: staffMaria.id,
                clientId: clients[2].id,
                startAt: atDay(d3, 10, 0),
                endAt: atDay(d3, 12, 0),
                status: client_1.BookingStatus.planned,
                priceCents: serviceColor.priceCents,
                currency: "RUB"
            },
            {
                tenantId: tenant.id,
                serviceId: serviceWomen.id,
                staffId: staffAlexey.id,
                clientId: clients[0].id,
                startAt: atDay(past1, 12, 0),
                endAt: atDay(past1, 13, 0),
                status: client_1.BookingStatus.arrived,
                priceCents: serviceWomen.priceCents,
                currency: "RUB"
            },
            {
                tenantId: tenant.id,
                serviceId: serviceMen.id,
                staffId: staffMaria.id,
                clientId: clients[1].id,
                startAt: atDay(past2, 15, 0),
                endAt: atDay(past2, 15, 45),
                status: client_1.BookingStatus.no_show,
                priceCents: serviceMen.priceCents,
                currency: "RUB",
                cancelledReason: "Клиент не пришёл (демо)"
            }
        ]
    });
    console.log("✅ Seed выполнен (RUB/+7): tenant lime + пользователи + услуги + расписание + клиенты + записи + финансы + payroll + шаблоны");
}
main()
    .catch((e) => {
    console.error("❌ Ошибка seed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map