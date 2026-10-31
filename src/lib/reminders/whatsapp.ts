// Client-safe: used by the reminder UI and the assistant's drafts.
export function whatsappLink(phone: string | null, text: string): string {
  const digits = phone?.replace(/\D/g, "");
  return `https://wa.me/${digits ?? ""}?text=${encodeURIComponent(text)}`;
}
