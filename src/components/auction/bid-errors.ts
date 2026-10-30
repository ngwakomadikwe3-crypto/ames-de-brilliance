import { formatMoney } from "./format.ts";

/**
 * Maps every rejection reason the bid API can return to a human sentence for
 * the bid modal. Pure and unit-tested; the modal renders whatever this says,
 * so no engine rejection can surface as a bare code to a bidder.
 */
export function bidRejectionMessage(
  reason: string,
  opts: { minimumMinor?: number; currency: string },
): string {
  switch (reason) {
    case "amount_below_minimum":
      return opts.minimumMinor !== undefined
        ? `Bid too low — the minimum bid is ${formatMoney(opts.minimumMinor, opts.currency)}.`
        : "Bid too low — raise your amount and try again.";
    case "lot_not_live":
      return "This lot is not open for bidding yet.";
    case "lot_closed":
      return "Bidding for this lot has closed.";
    case "bidder_unverified":
      return "Your account is not verified to bid yet — our team is reviewing your registration.";
    case "bidding_not_open":
      return "Public bidding is not open yet. Your account is registered — we will email you when bidding opens.";
    case "terms_not_accepted":
      return "Please review and accept the current auction terms before bidding.";
    case "rate_limited":
      return "Too many bids in a short time — wait a moment and try again.";
    case "lot_not_found":
      return "This lot is no longer available.";
    case "unauthenticated":
      return "Sign in with a verified account to bid.";
    case "invalid_body":
    case "invalid_json":
    case "invalid_lot_id":
      return "The bid could not be understood — refresh and try again.";
    case "internal_error":
    default:
      return "Something went wrong on our side — your bid was not placed. Try again.";
  }
}
