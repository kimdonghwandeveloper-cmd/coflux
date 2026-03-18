import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@11.1.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");

    let event;
    if (endpointSecret) {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        endpointSecret,
        undefined,
        cryptoProvider
      );
    } else {
      event = JSON.parse(body);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerEmail = session.customer_details?.email;
        const customerId = session.customer;

        if (customerEmail) {
          // 유저 티어를 'pro'로 업데이트하고 stripe_customer_id 저장
          const { error } = await supabaseClient
            .from("users")
            .update({ 
              tier: "pro", 
              stripe_customer_id: customerId 
            })
            .eq("email", customerEmail);

          if (error) console.error("Error updating user tier:", error);
          else console.log(`User ${customerEmail} upgraded to pro`);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;

        // 구독 상태가 active가 아니면(canceled, trialing_expired 등) free로 변경
        const newTier = status === "active" ? "pro" : "free";

        const { error } = await supabaseClient
          .from("users")
          .update({ tier: newTier })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Error updating user tier on change:", error);
        else console.log(`Customer ${customerId} tier updated to ${newTier}`);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
