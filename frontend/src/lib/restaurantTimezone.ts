export function timezoneForState(state: string) {
  switch ((state || "").toUpperCase()) {
    case "NY":
    case "NJ":
    case "MA":
    case "PA":
    case "FL":
    case "GA":
      return "America/New_York";
    case "CO":
    case "AZ":
      return "America/Denver";
    case "CA":
    case "WA":
    case "OR":
      return "America/Los_Angeles";
    default:
      return "America/Chicago";
  }
}
