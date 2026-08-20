/** Cash-deposit quote from an hourly pitch rate (demo: deposit is one third). */
export function quoteFromHourly(hourly: number) {
  const deposit = Math.round(hourly / 3);
  return {
    hourly,
    deposit,
    balance: hourly - deposit,
    bookingFee: 0,
  };
}

export function newBookingCode() {
  const token = Date.now().toString(36).slice(-4).toUpperCase();
  return `XL-${token}${Math.floor(Math.random() * 10)}`;
}
