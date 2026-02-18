class DashaService {
  getCurrentDasha(horoscopeData, date = new Date(), system = "vimsottari") {
    const dashas = horoscopeData.graha_dashas?.[system];
    if (!dashas || !Array.isArray(dashas)) return null;

    const sortedDashas = dashas
      .map((d) => ({
        name: d[0],
        date: new Date(d[1]),
      }))
      .sort((a, b) => a.date - b.date);

    for (let i = 0; i < sortedDashas.length; i++) {
      const current = sortedDashas[i];
      const next = sortedDashas[i + 1];

      if (date >= current.date && (!next || date < next.date)) {
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
