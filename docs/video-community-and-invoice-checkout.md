# Video activity and bank-transfer purchases

Customers sign in through their AMES account to like or save videos, add reviewed products to their cart, and view purchase requests. Saved videos appear in **My workspace**, including on other devices signed in to the same account. Older device-only interactions are not silently published or assigned to an account.

Comments require a verified account email. Comments and the account display name are public; email addresses, internal account IDs and contact details are excluded from the public response. Customers can delete their own comments and report other comments. AMES staff review reports at `/dashboard/community` and can hide comments. Comments are displayed as plain text.

## Link a video to a product

In the staff Videos screen, link a published video to a published jewellery listing. The product must have a current verified jeweller profile, completed publication review and a positive fixed price. The video then displays **Buy** and **Add to cart**. Representative assets, demonstration gemstones and products priced on request do not become offers for sale.

## Customer checkout

**Buy** adds the piece and opens `/cart`. Cart items use the current server-held price; callers cannot provide prices. Each listing represents one piece and appears once in the cart. Checkout requires available products in one currency, verified email and explicit invoice/contact acknowledgements.

**Request bank-transfer invoice** creates a private request visible under `/app/billing`. This does not collect payment or reserve stock. Repeated submission with the same request key returns the same purchase request. Delivery and tax are confirmed on the issued invoice.

## Staff purchase desk

At `/dashboard/purchases`, authorised owner staff:

1. Confirm availability, seller authority, delivery and invoice terms.
2. Enter the real invoice number, bank-transfer instructions, payment reference and delivery/tax amounts. Issuing the invoice rechecks the product revision and price, and reserves each piece against that request. Conflicting requests cannot invoice the same piece.
3. Check the actual bank receipt independently. Only then record the payment reference and confirm the full invoice amount was received.
4. Record the dispatch or fulfilment reference after payment.

No automatic bank confirmation, card charge, tax calculation, seller payout or email delivery is implied. Bank instructions must be entered by authorised staff; no bank credentials are embedded in source. Paid requests cannot be cancelled through this screen; refunds need the existing AMES process. Cancelling an unpaid request releases only its own reservations and hides its payment instructions.

## Storage and verification

Production uses the private Appwrite `account_activity` collection with no client read/write permissions. Server queries are account-filtered. Staff actions require the owner session. Mutations require the same origin, and social actions are rate limited. Deterministic record IDs and shared listing locks protect idempotent reactions, cart changes and competing invoices.

Local verification uses isolated identities, products, invoices and storage, never real customer accounts or transfers. Browser profiles cover mobile and tablet viewports; they do not replace physical Tecno Spark or iPad testing.
