// Shelly 2PM: PV-gesteuerte Pumpe – 1x automatischer Start + 1x automatisches Stop pro Tag
// Enthält runTimeSec, autoStartedToday, autoStoppedToday, manuelle Steuerung geschützt

// ——— KONFIGURATION ———
let threshold = 560;
let onMorningThreshold = 400;
let sunriseThresh = 1;
let delayAfterSunrise = 4 * 3600;
let runDuration = 6 * 3600;
let timerSec = 10;
let intervalsNeeded = (5 * 60) / timerSec;
let sunriseNeeded = (5 * 60) / timerSec;
let sunsetNeeded = (30 * 60) / timerSec;

let googleUrl = "<DEIN_GOOGLE_SCRIPT_URL>";

// ——— ZUSTANDSVARIABLEN ———
let relayState = false;
let aboveCounter = 0;
let belowCounter = 0;
let sunriseCounter = 0;
let aboveAfterSunriseCounter = 0;
let sunriseOffset = null;
let sunsetCounter = 0;
let runComplete = false;
let runTimeSec = 0;
let autoStartedToday = false;
let autoStoppedToday = false;
let manualOverride = false;

// ——— TAGESSTATISTIK ———
let pvSumWh = 0;
let pumpSumWh = 0;
let netzbezugWh = 0;
let ueberschussWh = 0;

function sendLog(msg) {
  print(msg);
  try {
    let body = JSON.stringify({ log: msg });
    Shelly.call("http.request", {
      method: "POST",
      url: googleUrl,
      headers: { "Content-Type": "application/json" },
      body: body
    });
  } catch (e) {
    print("sendLog-Fehler: " + e);
  }
}

function formatEnergy(mWh) {
  let wh = mWh / 1000;
  return wh >= 1000 ? (wh / 1000).toFixed(2) + " kWh" : wh.toFixed(1) + " Wh";
}

// ——— INITIALISIERUNG ———
Shelly.call("Switch.Set", { id: 1, on: false });
sendLog("Programm neu gestartet.");

// ——— MANUELLE STEUERUNG ———
Shelly.addEventHandler(function (event) {
  if (event.name !== "input") return;

  if (event.id === 1 && !event.info.state && relayState) {
    Shelly.call("Switch.Set", { id: 1, on: false });
    relayState = false;
    manualOverride = false;
    sendLog("Du hast die Pumpe manuell ausgeschaltet.");
  }

  if (event.id === 1 && event.info.state && !relayState) {
    Shelly.call("Switch.Set", { id: 1, on: true });
    relayState = true;
    if (runComplete) manualOverride = true;
    sendLog("Du hast die Pumpe manuell eingeschaltet.");
  }
});

// ——— HAUPT-TIMER ———
Timer.set(timerSec * 1000, true, function () {
  let up = Shelly.getComponentStatus("sys").uptime;
  let currentRelayState = Shelly.getComponentStatus("switch", 1).output;

  if (currentRelayState && !relayState) {
    relayState = true;
    if (runComplete) manualOverride = true;
    sendLog("Pumpe wurde extern (z. B. per RPC) eingeschaltet – wird nun als manuell behandelt.");
  }

  if (!currentRelayState && relayState) {
    relayState = false;
    manualOverride = false;
    sendLog("Pumpe wurde extern ausgeschaltet.");
  }

  let sw0 = Shelly.getComponentStatus("input", 0).state;
  let sw1 = Shelly.getComponentStatus("input", 1).state;
  if (sw0 || sw1) return;

  let power = Math.abs(Shelly.getComponentStatus("switch", 0).apower);
  print("Leistung: " + power + " W, uptime: " + up);

  // — SUNRISE-ERKENNUNG —
  if (sunriseOffset === null) {
    sunriseCounter = power >= sunriseThresh ? sunriseCounter + 1 : 0;
  
    if (sunriseCounter >= sunriseNeeded) {
      sunriseOffset = up;
  
      // Nur wenn nicht manuell gestartet:
      if (!relayState) {
        runTimeSec = 0;
        runComplete = false;
        autoStartedToday = false;
        autoStoppedToday = false;
      }
  
      sendLog("Sonnenaufgang erkannt – PV-Leistung stabil.");
    }
  }

  // — SUNSET-ERKENNUNG UND RESET —
  if (sunriseOffset !== null) {
    sunsetCounter = power < sunriseThresh ? sunsetCounter + 1 : 0;

    if (sunsetCounter >= sunsetNeeded) {
      sunriseOffset = null;
      sunriseCounter = 0;
      sunsetCounter = 0;
      aboveAfterSunriseCounter = 0;
      autoStartedToday = false;
      autoStoppedToday = false;
      runComplete = false;

      let gedecktWh = (pumpSumWh - netzbezugWh) / 1000;
      let gesamtPumpWh = pumpSumWh / 1000;
      let eigennutzPump = gesamtPumpWh > 0 ? (gedecktWh / gesamtPumpWh) * 100 : 0;
      let pvVerbrauchWh = pvSumWh - ueberschussWh;
      let eigennutzGesamt = pvSumWh > 0 ? (pvVerbrauchWh / pvSumWh) * 100 : 0;

      let logText =
        "Sonnenuntergang erkannt – Tagesende.\n" +
        "- PV-Ertrag: " + formatEnergy(pvSumWh) + "\n" +
        "- Pumpenverbrauch: " + formatEnergy(pumpSumWh) + "\n" +
        "- Netzbezug: " + formatEnergy(netzbezugWh) + "\n" +
        "- PV-Überschuss: " + formatEnergy(ueberschussWh) + "\n" +
        "- Pumpenverbrauch PV-Anteil: " + eigennutzPump.toFixed(1) + " %\n" +
        "- PV-Eigennutzung gesamt: " + eigennutzGesamt.toFixed(1) + " %\n" +
        "- Pumpenlaufzeit: " + Math.round(runTimeSec / 60) + " min";

      sendLog(logText);
    }
  }

  // — AUTOMATISCHER START —
  if (!runComplete && sunriseOffset !== null && !relayState && !autoStartedToday) {
    let windowStart = sunriseOffset + delayAfterSunrise;
    if (up >= windowStart || aboveAfterSunriseCounter >= intervalsNeeded) {
      Shelly.call("Switch.Set", { id: 1, on: true });
      relayState = true;
      autoStartedToday = true;
      sendLog("Automatischer Start.");
      return;
    }

    if (power > onMorningThreshold) aboveAfterSunriseCounter++;
    else aboveAfterSunriseCounter = 0;
  }

  // — LAUFZEITÜBERWACHUNG UND STOPP —
  if (relayState) {
    runTimeSec += timerSec;

    if (manualOverride) return;
    if (!runComplete && runTimeSec < runDuration) return;

    if (!autoStoppedToday && power <= threshold) {
      Shelly.call("Switch.Set", { id: 1, on: false });
      relayState = false;
      autoStoppedToday = true;
      runComplete = true;
      sendLog("Automatischer Stopp: PV-Leistung zu niedrig oder Zeit abgelaufen.");
      return;
    }
  }

  // — HYSTERESE EIN —
  if (!relayState && !autoStartedToday && power > threshold) {
    aboveCounter++;
    if (aboveCounter >= intervalsNeeded) {
      Shelly.call("Switch.Set", { id: 1, on: true });
      relayState = true;
      autoStartedToday = true;
      sendLog("Hysterese: Pumpe eingeschaltet.");
      aboveCounter = 0;
    }
  } else {
    aboveCounter = 0;
  }

  // — HYSTERESE AUS —
  if (relayState && power <= threshold) {
    belowCounter++;
    if (belowCounter >= intervalsNeeded && !autoStoppedToday) {
      Shelly.call("Switch.Set", { id: 1, on: false });
      relayState = false;
      autoStoppedToday = true;
      sendLog("Hysterese: Pumpe ausgeschaltet.");
      belowCounter = 0;
    }
  } else {
    belowCounter = 0;
  }
});

// ——— ENERGIESTATISTIK ———
Timer.set(60 * 1000, true, function () {
  let pvArray = Shelly.getComponentStatus("switch", 0).aenergy.by_minute;
  let pumpeArray = Shelly.getComponentStatus("switch", 1).aenergy.by_minute;
  if (!pvArray || !pumpeArray || pvArray.length < 1 || pumpeArray.length < 1) return;

  let pv = pvArray[0];
  let pumpe = pumpeArray[0];

  pvSumWh += pv;
  pumpSumWh += pumpe;

  if (pv < pumpe) netzbezugWh += (pumpe - pv);
  else ueberschussWh += (pv - pumpe);
});
