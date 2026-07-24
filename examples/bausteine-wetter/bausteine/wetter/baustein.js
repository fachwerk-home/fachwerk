export default function rechne(eingaenge, ctx) {
  // Test-Fixtures als Parameter
  if (ctx.parameter && ctx.parameter._test_json) {
    ctx.ausloeser = { art: "netz", ok: true, text: ctx.parameter._test_json };
  } else if (ctx.parameter && ctx.parameter._test_fehler) {
    ctx.ausloeser = { art: "netz", ok: false, fehler: ctx.parameter._test_fehler };
  }

  // 1. Verarbeitung der Netz-Antwort
  if (ctx.ausloeser && ctx.ausloeser.art === "netz") {
    if (!ctx.ausloeser.ok) {
      return { fehler: ctx.ausloeser.fehler || "Unbekannter Netzfehler" };
    }
    
    let daten;
    try {
      daten = JSON.parse(ctx.ausloeser.text);
    } catch {
      return { fehler: "Ungueltiges JSON empfangen" };
    }
    
    if (daten.error) {
      return { fehler: "API Fehler: " + (daten.reason || "") };
    }
    
    const erg = {};
    const curr = daten.current;
    if (curr) {
      erg.temperatur = curr.temperature_2m;
      erg.gefuehlt = curr.apparent_temperature;
      erg.luftfeuchte = curr.relative_humidity_2m;
      erg.wind_kmh = curr.wind_speed_10m;
      erg.windrichtung = curr.wind_direction_10m;
      erg.niederschlag_mm = curr.precipitation;
      erg.wettercode = curr.weather_code;
      erg.ist_tag = curr.is_day;
      if (curr.time) {
        erg.stand = curr.time;
      }
    }
    
    const daily = daten.daily;
    const tage = Number(ctx.parameter.tage ?? 3);
    if (daily) {
      for (let i = 0; i < tage; i++) {
        const n = i + 1; // tag1, tag2, ...
        if (daily.temperature_2m_max && daily.temperature_2m_max[i] !== undefined) {
           erg[`tag${n}_max`] = daily.temperature_2m_max[i];
           erg[`tag${n}_min`] = daily.temperature_2m_min[i];
           erg[`tag${n}_niederschlag_mm`] = daily.precipitation_sum[i];
           erg[`tag${n}_wettercode`] = daily.weather_code[i];
        }
      }
    }
    
    erg.fehler = "";
    return erg;
  }
  
  // 2. Regulärer Aufruf (Eingang oder Timer)
  const isTimer = ctx.ausloeser && ctx.ausloeser.art === "timer";
  const hasAbruf = (eingaenge.abruf !== undefined && eingaenge.abruf !== null) || Object.keys(eingaenge).length > 0;
  
  if (!isTimer && !hasAbruf) {
    // Nur Initialisierung, kein direkter Trigger: Timer anwerfen und warten.
    const min = Math.max(15, Number(ctx.parameter.intervall_min ?? 30));
    ctx.planeTimer("wetter-zyklus", min * 60 * 1000);
    return null;
  }
  
  // Timer neu planen
  const min = Math.max(15, Number(ctx.parameter.intervall_min ?? 30));
  ctx.planeTimer("wetter-zyklus", min * 60 * 1000);
  
  const breite = ctx.parameter.breite ?? 52.52;
  const laenge = ctx.parameter.laenge ?? 13.41;
  const tage = Math.min(7, Math.max(0, Number(ctx.parameter.tage ?? 3)));
  
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${breite}&longitude=${laenge}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=${tage}&timeformat=unixtime`;
  
  ctx.netz.hole("open-meteo", url, { methode: "GET" });
  
  return null;
}
