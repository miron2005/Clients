import BookingFlow from "@/app/_public/BookingFlow";

export default function TenantBookingPage({ params }: { params: { tenant: string } }) {
  return <BookingFlow tenantSlug={params.tenant} />;
}
