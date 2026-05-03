import { redirect } from "next/navigation";

/** Public seller profiles live at `/seller/[id]`. This route avoids a broken duplicate page that used `params.id` here. */
export default function SellerIndexRedirect() {
  redirect("/");
}
