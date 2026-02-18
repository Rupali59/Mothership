class DashaService {
  getCurrentDasha(horoscopeData, date = new Date(), system = "vimsottari") {
    const dashas = horoscopeData.graha_dashas?.[system];
    if (!dashas || !Array.isArray(dashas)) return null;

    // dashas is array of [name, dateString]
    // The dateString represents the END date of the previous period / START of this period?
    // Let's assume the date provided is the START date of that period.
    // We need to sort them just in case.

    // Sort by date
    const sortedDashas = dashas
      .map((d) => ({
        name: d[0],
        date: new Date(d[1]),
      }))
      .sort((a, b) => a.date - b.date);

    // Find the period where date is between current and next
    for (let i = 0; i < sortedDashas.length; i++) {
      const current = sortedDashas[i];
      const next = sortedDashas[i + 1];

      if (date >= current.date && (!next || date < next.date)) {
        // Calculate end date (it's the start of next)
        const endDate = next ? next.date : null;
        const daysRemaining = endDate
          ? Math.ceil((endDate - date) / (1000 * 60 * 60 * 24))
          : null;

        return {
          system,
          period: current.name,
          startDate: current.date.toISOString(),
          endDate: endDate ? endDate.toISOString() : "Unknown",
          daysRemaining,
        };
      }
    }

    return null;
  }
}

module.exports = new DashaService();
