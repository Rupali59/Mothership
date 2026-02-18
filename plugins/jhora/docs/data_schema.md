# JHora API Data Schema

This document describes the complete data structure returned by the JHora API based on analysis of actual API responses.

## Overview

The JHora API returns a comprehensive astrological analysis containing:

- **Birth Details**: Input parameters
- **Calendar Information**: Panchang data for the birth time
- **Charts**: Bhava chart and 16 divisional charts (D1 through D144)
- **Planetary Analysis**: Positions, strengths, states, and relationships
- **Yogas & Doshas**: Astrological combinations and afflictions
- **Dasha Systems**: 4 different predictive timeline systems
- **Special Points**: Lagnas, Sahams, Upagrahas, Arudhas
- **Strength Calculations**: Shad Bala, Bhava Bala, Vimsopaka Bala, Ashtakavarga
- **Transit Analysis**: Sade Sati calculations

**Total Data Size**: ~475KB JSON (9565 lines)

---

## 1. Birth Details

```json
{
  "birth_details": {
    "date": "1992-09-05",
    "time": "00:09:00",
    "place": "Bhopal",
    "latitude": 23.25469,
    "longitude": 77.40289,
    "timezone": 5.5
  }
}
```

---

## 2. Calendar Information (Panchang)

Contains detailed panchang data for the birth time:

```json
{
  "calendar_info": {
    "Place": "Bhopal",
    "Latitude": "23° 15' 17\" N",
    "Longitude": "77° 24' 10\" E",
    "Timezone Offset": "5.50",
    "Report Date": "2026-1-27",
    "Day": "Tuesday",
    "Calcuation Type:": "Drik",
    "Lunar Year/Month:": "Vishvavasu / Maasi",
    "Solar Month:": "Thai Date 13",
    "Kali Year": 5126,
    "Vikarama Year": 2082,
    "Saka Year": 1947,
    "Sun Rise": "07:06:05",
    "Sun Set": "18:00:17",
    "Moon Rise": "12:38:59",
    "Moon Set": "01:15:08",
    "Tithi": "Sukla Paksha Navami...",
    "Raasi": "Aries 16:45:06 ends...",
    "Nakshatram": "Bharani (Ve) Quarter-3...",
    "Raagu Kaalam": "15:16:44 from 16:38:31 ends",
    "KuLigai": "12:33:11 from 13:54:58 ends",
    "Yamagandam": "09:49:38 from 11:11:24 ends",
    "Yoga": "Subha (Su/Sa)...",
    "Karana": "Baalava (Mo)...",
    "Abhijit": "12:11:23 from 12:54:59 ends",
    "Dhur Muhurtham": "09:16:55 from 10:00:32 ends"
  }
}
```

**Fields**: 25+ panchang elements including muhurtas, yoga, karana, tithi, nakshatra

---

## 3. Bhava Chart

Array of 12 houses showing planetary placements:

```json
{
  "bhava_chart": [
    "",                    // House 1 (Aries)
    "Moon\n",             // House 2 (Taurus)
    "",                   // House 3 (Gemini)
    "Jupiter℞\n",         // House 4 (Cancer) - ℞ indicates retrograde
    "Kethu\n",           // House 5 (Leo)
    "",                   // House 6 (Virgo)
    "Ascendantℒ\n",      // House 7 (Libra) - ℒ indicates lagna
    "",                   // House 8 (Scorpio)
    "",                   // House 9 (Sagittarius)
    "Sun\nMars\nMercury\nVenus\n",  // House 10 (Capricorn)
    "Raagu\n",           // House 11 (Aquarius)
    "Saturn\n"           // House 12 (Pisces)
  ]
}
```

**Format**: Array of 12 strings, newline-separated planet names with special symbols

---

## 4. Divisional Charts

### 4.1 Available Divisions

16 divisional charts (Vargas):

- **D-1** (rasi): Main birth chart
- **D-2** (hora): Wealth
- **D-3** (drekkana): Siblings
- **D-4** (chaturthamsa): Property
- **D-5** (panchamsa): Fame
- **D-6** (shashthamsa): Health
- **D-7** (saptamsa): Children
- **D-8** (ashtamsa): Longevity
- **D-9** (navamsa): Marriage/Dharma
- **D-10** (dasamsa): Career
- **D-11** (rudramsa): Destruction
- **D-12** (dwadasamsa): Parents
- **D-16** (shodasamsa): Vehicles
- **D-20** (vimsamsa): Spiritual practices
- **D-24** (chaturvimsamsa): Education
- **D-27** (nakshatramsa): Strengths/weaknesses
- **D-30** (trimsamsa): Evils/misfortunes
- **D-40** (khavedamsa): Auspicious/inauspicious effects
- **D-45** (akshavedamsa): Character/conduct
- **D-60** (shastiamsa): Past life karma
- **D-81** (nava_navamsa): Navamsa of navamsa
- **D-108** (ashtottaramsa): Subtle influences
- **D-144** (dwadas_dwadasamsa): Dwadasamsa of dwadasamsa

### 4.2 Chart Structure

Each divisional chart contains planetary positions:

```json
{
  "D-1_rasi": {
    "Ascendant": {
      "sign": "Taurus",
      "longitude": 28.8143
    },
    "Sun": {
      "sign": "Leo",
      "longitude": 18.7135
    },
    // ... all 10 planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu)
  }
}
```

**Planets**: Ascendant + 9 grahas (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu)

---

## 5. Nakshatra Pada

Nakshatra and pada information for each planet:

```json
{
  "nakshatra_pada": {
    "Sun": {
      "nakshatra": "Purva Phalguni",
      "nakshatra_number": 11,
      "pada": 2,
      "nakshatra_lord": "Venus",
      "degrees_in_nakshatra": 5.3802
    }
    // ... for all planets
  }
}
```

**Fields**: nakshatra name, number (1-27), pada (1-4), lord, degrees

---

## 6. Amsa Rulers

Shodasamsa (D-150) analysis for planets and special lagnas:

```json
{
  "amsa_rulers": {
    "Sun": {
      "division_index": 94,
      "amsa_index": 57,
      "amsa_name": "Sheetalaa",
      "sign": "Leo",
      "longitude": 18.7135
    }
    // ... for all planets and 25+ special points
  }
}
```

**Coverage**: All planets + 25 special lagnas (Bhava, Hora, Ghati, Vighati, Pranapada, Indu, Bhrigu Bindu, Kunda, Sree, Kaala, Mrityu, etc.)

---

## 7. Yogas

### 7.1 Summary

```json
{
  "yogas": {
    "summary": {
      "total_yogas_found": 15,
      "total_yogas_possible": 93,
      "total_raja_yogas_found": 0,
      "total_raja_yogas_possible": 3
    }
  }
}
```

### 7.2 Yoga List

Each yoga contains:

```json
{
  "yoga_list": {
    "vesi_yoga": [
      "D1",                                    // Chart
      "Vesai Yoga",                           // Name
      "There is a planet other than Moon...", // Condition
      "You will have a balanced outlook..."   // Result/Interpretation
    ]
  }
}
```

**Common Yogas**: Vesi, Vosi, Ubhayachara, Nipuna, Sunaphaa, Anaphaa, Duradhara, Sasa (Pancha Mahapurusha), Paasa, Amala, Kaahala, Bheri, Matsya, Bhaarathi, Vasumati

---

## 8. Doshas

HTML-formatted dosha analysis:

```json
{
  "doshas": {
    "Kala Sarpa Dosha": "<html>There is no Kala Sarpa Dosha...</html>",
    "Manglik Dosha": "<html>According to Vedic Astrology...</html>",
    "Pitru Dosha": "<html>Pitru Dosha is a planetary flaw...</html>",
    "Guru Chandala Dosha": "<html>There is no Guru Chandal dosha...</html>",
    "Ganda Moola Dosha": "<html>There is no ganda moola dosha...</html>",
    "Kalathra Dosha": "<html>There is no kalathra dosha...</html>",
    "Ghata Dosha": "<html>There is no ghata dosha...</html>",
    "Shrapit Dosha": "<html>There is no shrapit dosha...</html>"
  }
}
```

**Format**: HTML strings with detailed explanations and remedies

---

## 9. Chara Karakas

Jaimini system significators:

```json
{
  "chara_karakas": {
    "atma_karaka": {      // Soul significator
      "planet": "Jupiter",
      "sign": "Leo",
      "longitude": 28.5485
    },
    "amatya_karaka": {},  // Career significator
    "bhratri_karaka": {}, // Siblings significator
    "maitri_karaka": {},  // Friends significator
    "pitri_karaka": {},   // Father significator
    "putra_karaka": {},   // Children significator
    "jnaati_karaka": {},  // Relatives significator
    "data_karaka": {}     // Spouse significator
  }
}
```

**Karakas**: 8 significators based on planetary degrees

---

## 10. Sahams (Arabic Parts)

34 sensitive points:

```json
{
  "sahams": {
    "Punya Saham": "Libra 8° 25' 47\"",
    "Vidya Saham": "Aquarius 19° 11' 56\"",
    "Yasas Saham": "Aries 18° 55' 59\"",
    // ... 31 more sahams
  }
}
```

**Common Sahams**: Punya (Fortune), Vidya (Education), Yasas (Fame), Mitra (Friends), Puthra (Children), Vivaha (Marriage), Karma (Career), Roga (Disease), etc.

---

## 11. Upagrahas (Sub-planets)

11 calculated sensitive points:

```json
{
  "upagrahas": {
    "dhuma": { "sign": "Capricorn", "longitude": 2.0468 },
    "vyatipaata": { "sign": "Gemini", "longitude": 27.9532 },
    "parivesha": { "sign": "Sagittarius", "longitude": 27.9532 },
    "indrachaapa": { "sign": "Cancer", "longitude": 2.0468 },
    "upaketu": { "sign": "Cancer", "longitude": 18.7135 },
    "kaala": { "sign": "Sagittarius", "longitude": 14.2595 },
    "mrityu": { "sign": "Aquarius", "longitude": 4.8314 },
    "artha_praharaka": { "sign": "Leo", "longitude": 29.6111 },
    "yama_ghantaka": { "sign": "Virgo", "longitude": 20.9963 },
    "gulika": { "sign": "Libra", "longitude": 22.3769 },
    "maandi": { "sign": "Scorpio", "longitude": 2.5957 }
  }
}
```

---

## 12. Special Lagnas

9 special ascendant points:

```json
{
  "special_lagnas": {
    "pranapada_lagna": { "sign": "Aries", "longitude": 25.5468 },
    "indu_lagna": { "sign": "Pisces", "longitude": 28.329 },
    "bhrigu_bindhu_lagna": { "sign": "Gemini", "longitude": 0.6277 },
    "sree_lagna": { "sign": "Aries", "longitude": 13.6959 },
    "kunda_lagna": { "sign": "Gemini", "longitude": 23.9544 },
    "bhava_lagna": { "sign": "Taurus", "longitude": 19.5794 },
    "hora_lagna": { "sign": "Aquarius", "longitude": 19.9818 },
    "ghati_lagna": { "sign": "Taurus", "longitude": 21.1889 },
    "vighati_lagna": { "sign": "Virgo", "longitude": 13.3201 }
  }
}
```

---

## 13. Arudha Padhas

Projected houses for all divisional charts:

```json
{
  "arudha_padhas": {
    "D-1-Arudha Lagna (AL)": "Capricorn",
    "D-1-Dhanarudha (A2)": "Libra",
    "D-1-Bhatrarudha (A3)": "Pisces",
    // ... A4 through A12, UL for D-1
    // ... Same for D-2, D-3, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-12, D-16, D-20, D-24, D-27, D-30, D-40, D-45, D-60, D-81, D-108, D-144
  }
}
```

**Coverage**: 12 arudhas × 23 charts = 276 arudha points

---

## 14. Planetary States

```json
{
  "planetary_states": {
    "retrograde_planets": ["Saturn", "Uranus", "Neptune"],
    "combusted_planets": ["Jupiter"],
    "exalted_planets": [],
    "debilitated_planets": ["Moon", "Venus"],
    "own_sign_planets": ["Sun", "Saturn"],
    "friend_sign_planets": ["Mercury", "Jupiter"],
    "enemy_sign_planets": ["Mars"]
  }
}
```

---

## 15. Shad Bala (Six-fold Strength)

Planetary strength calculations in a 9×7 matrix:

```json
{
  "shad_bala": [
    [189.6, 207.19, 191.2, 231.75, 248.4, 162.74, 129.58],  // Sthana Bala
    [178.49, 186.96, 147.54, 130.19, 156.24, 164.8, 139.21], // Dig Bala
    [0.91, 25.88, 24.69, 36.61, 30.09, 51.56, 76.86],       // Kaala Bala
    [0, 0, 34.98, 13.0, 2.91, 15.17, 50.52],                // Chesta Bala
    [60.0, 51.43, 17.14, 25.71, 34.29, 42.86, 8.57],        // Naisargika Bala
    [-14.34, -12.9, 15.45, -11.91, -16.8, -20.5, -0.45],    // Drik Bala
    [414.66, 458.56, 431.0, 425.35, 455.13, 416.63, 404.29], // Total Bala
    [6.91, 7.64, 7.18, 7.09, 7.59, 6.94, 6.74],             // Rupas
    [1.38, 1.27, 1.44, 1.01, 1.17, 1.26, 1.35]              // Relative Strength
  ]
}
```

**Columns**: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn

---

## 16. Bhava Bala (House Strength)

Strength of 12 houses:

```json
{
  "bhava_bala": [
    "[445.34   7.42   1.06]",  // House 1: [Total, Rupas, Relative]
    "[475.92   7.93   1.13]",  // House 2
    // ... Houses 3-12
  ]
}
```

---

## 17. Other Bala (Additional Strengths)

```json
{
  "other_bala": {
    "harsha_bala": {
      "Sun": 10, "Moon": 10, "Mars": 0, "Mercury": 5,
      "Jupiter": 5, "Venus": 5, "Saturn": 15
    },
    "pancha_vargeeya_bala": {
      "Sun": 11.78, "Moon": 2.61, "Mars": 8.49, "Mercury": 19.12,
      "Jupiter": 18.16, "Venus": 7.56, "Saturn": 19.93
    },
    "dwadhasa_vargeeya_bala": {
      "Sun": 5, "Moon": 5, "Mars": 4, "Mercury": 6,
      "Jupiter": 6, "Venus": 7, "Saturn": 8
    },
    "ishta_phala": {
      "Sun": 45, "Moon": 4, "Mars": 8, "Mercury": 22,
      "Jupiter": 8, "Venus": 22, "Saturn": 30
    },
    "kashta_phala": {
      "Sun": 15, "Moon": 56, "Mars": 52, "Mercury": 38,
      "Jupiter": 52, "Venus": 38, "Saturn": 30
    }
  }
}
```

---

## 18. Vimsopaka Bala

Divisional chart strength in 4 schemes:

```json
{
  "vimsopaka_bala": [
    {  // Scheme 1 (Parashara)
      "Sun": "No Amsa\n(D1)\n11.6",
      "Moon": "No Amsa\n(D3)\n13.5",
      // ... all planets
    },
    {}, // Scheme 2 (Venkatesha)
    {}, // Scheme 3 (Shadbala)
    {}  // Scheme 4 (Jaimini)
  ]
}
```

---

## 19. Ashtakavarga

Detailed transit prediction system:

```json
{
  "ashtakavarga": {
    "binna_ashtaka_varga": [
      [4, 0, 1, 2, 2, 2, 0, 0, 0, 3, 2, 2],  // Sun's BAV
      [0, 4, 1, 0, 2, 0, 0, 2, 0, 1, 0, 3],  // Moon's BAV
      // ... Mars, Mercury, Jupiter, Venus, Saturn BAVs
      [5, 4, 5, 2, 4, 4, 5, 6, 2, 6, 2, 4]   // Total BAV
    ],
    "samudhaya_ashtaka_varga": [30, 31, 36, 30, 26, 26, 25, 22, 24, 31, 24, 32],
    "prastara_ashtaka_varga": [
      // 8 planets × 12 houses × 10 rows (8 planets + Lagna + Total)
    ],
    "raasi_pindas": ["137", "125", "96", "97", "105", "99", "134"],
    "graha_pindas": [77, 63, 31, 38, 63, 39, 81],
    "sodhya_pindas": ["214", "188", "127", "135", "168", "138", "215"]
  }
}
```

---

## 20. Dasha Systems

### 20.1 Vimsottari Dasha

120-year cycle:

```json
{
  "graha_dashas": {
    "vimsottari": [
      ["Mercury-Mercury", "1977-10-22 20:36:52"],
      ["Mercury-Kethu", "1980-03-20 12:25:56"],
      // ... 100+ dasha periods
    ]
  }
}
```

### 20.2 Other Dasha Systems

- **Ashtottari**: 108-year cycle
- **Yogini**: 36-year cycle
- **Shodasottari**: 116-year cycle

Each follows the same format: `[["Planet-SubPlanet", "YYYY-MM-DD HH:MM:SS"], ...]`

---

## 21. Sade Sati (Saturn Transit)

### 21.1 Moon-based Sade Sati

```json
{
  "sade_sati": {
    "moonTransits": {
      "fourthHouse": {
        "degreeBased": [
          {
            "period": 1,
            "startDate": "2002-04-19",
            "endDate": "2004-07-16",
            "description": "Saturn 90-120° from reference (58.33°)..."
          }
        ],
        "signBased": [
          {
            "period": 1,
            "startDate": "1999-04-21",
            "endDate": "2001-06-05",
            "description": "Saturn in 4th sign from reference (Scorpio)",
            "referenceSign": "Scorpio",
            "phase1": {
              "sign": "Aries",
              "house": "4th",
              "startDate": "1999-04-21",
              "endDate": "2001-06-05"
            },
            "phase2": null,
            "phase3": null
          }
        ]
      },
      "eighthHouse": { /* similar structure */ }
    }
  }
}
```

### 21.2 Ascendant-based Sade Sati

Similar structure for ascendant transits.

---

## 22. Additional Metadata

```json
{
  "ayanamsa_value": 24.221298425634245,
  "julian_day": 2461067.5
}
```

---

## Data Processing Considerations

### Size & Performance

- **Total Size**: ~475KB JSON
- **Lines**: 9,565
- **Recommended**: Stream processing for large datasets
- **Caching**: Essential for repeated access

### Nested Structures

- Maximum nesting depth: 5 levels
- Arrays: Dasha systems (100+ entries each)
- Objects: Divisional charts (23 charts × 10 planets)

### Data Types

- **Strings**: Signs, planet names, HTML doshas
- **Numbers**: Longitudes (decimals), strengths (integers/decimals)
- **Arrays**: Charts, dashas, ashtakavarga matrices
- **Null**: Sade Sati phase2/phase3 when not applicable

### Special Formatting

- **Degrees**: "Libra 8° 25' 47\""
- **HTML**: Dosha descriptions contain HTML tags
- **Symbols**: ℞ (retrograde), ℒ (lagna) in bhava_chart
- **Newlines**: Planet names in bhava_chart separated by `\n`
