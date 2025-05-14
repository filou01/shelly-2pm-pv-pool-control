// Shelly 2PM: PV-gesteuerte Pumpe mit robustem Automatikablauf
// - 1× automatischer Start pro Tag nach Sonnenaufgang oder Morning-Peak
// - 1× automatischer Stop nach 6h oder bei geringer PV-Leistung
// - Automatik läuft nur, wenn Relais IST-Zustand dem Automatik-SOLL entspricht
// - Hysterese-AUS nur nach abgeschlossenem Tageslauf erlaubt
// - Energie- und Statusdaten werden minütlich gespeichert

// ——— KONFIGURATION ———
let threshold           = 560;           // W: Hysterese-Schwelle
let onMorningThreshold  = 400;           // W: Morning-Peak-Frühstart
let sunriseThresh       = 1;             // W: Grenze für Sunrise/Sunset
let delayAfterSunrise   = 4 * 3600;      // s: Verzögerung nach Sunrise
let runDuration         = 6 * 3600;      // s: Maximale Tageslaufzeit
let timerSec            = 10;            // s: Hauptlogik-Intervall
let intervalsNeeded     = (5 * 60) / timerSec;
let sunriseNeeded       = (5 * 60) / timerSec;
let sunsetNeeded        = (30 * 60) / timerSec;
let textComponentId     = 200;           // Komponente für Statusspeicherung
let googleUrl           = "<DEIN_GOOGLE_SCRIPT_URL>";  // Logging-Ziel

// ——— ZUSTANDSVARIABLEN ———
let relayState              = false;     // Aktueller Relais-Zustand
let expectedRelayState      = false;     // Automatisch erwarteter Zustand
let runComplete             = false;     // Tageslauf abgeschlossen?
let runTimeSec              = 0;
let sunriseOffset           = null;
let aboveCounter            = 0;
let belowCounter            = 0;
let aboveAfterSunriseCounter = 0;
let sunriseCounter          = 0;
let sunsetCounter           = 0;

// ——— TAGESSTATISTIK ———
let pvSumWh       = 0;
let pumpSumWh     = 0;
let netzbezugWh   = 0;
let ueberschussWh = 0;

// ——— HILFSFUNKTIONEN ———
function sendLog(msg) {
  print(msg);
  try {
    Shelly.call("http.request", {
      method: "POST",
      url: googleUrl,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log: msg })
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
relayState = Shelly.getComponentStatus("switch", 1).output;
expectedRelayState = relayState;
sendLog("Programm gestartet. Ist-Zustand: " + relayState);

// ——— ZUSTAND WIEDERHERSTELLEN ———
Shelly.call("Text.GetConfig", { id: textComponentId }, function(res, code) {
  if (code === 0 && res.config && res.config.text) {
    try {
      let c = JSON.parse(res.config.text);
      runTimeSec         = c.rT || 0;
      runComplete        = !!c.rC;
      expectedRelayState = !!c.eR;
      sunriseOffset      = (c.sO >= 0) ? c.sO : null;
      relayState         = !!c.rS;
      pvSumWh            = c.p || 0;
      pumpSumWh          = c.P || 0;
      netzbezugWh        = c.n || 0;
      ueberschussWh      = c.u || 0;
      sendLog("Zustand wiederhergestellt.");
    } catch (e) {
      sendLog("Parse-Fehler: " + e);
    }
  }
});

// ——— HAUPTLOGIK (alle 10 Sekunden) ———
Timer.set(timerSec * 1000, true, function() {
  let up    = Shelly.getComponentStatus("sys").uptime;
  let cur   = Shelly.getComponentStatus("switch", 1).output;
  let power = Math.abs(Shelly.getComponentStatus("switch", 0).apower);
  let sw0   = Shelly.getComponentStatus("input", 0).state;
  let sw1   = Shelly.getComponentStatus("input", 1).state;

  // Manuelle Eingriffe synchronisieren
  if (cur !== relayState) {
    relayState = cur;
    expectedRelayState = cur;
    sendLog("Manuell geändert – Ist = " + cur);
  }

  // Bei Tastereingriff: Automatik pausieren
  if (sw0 || sw1) return;

  print("Leistung: " + power + " W, uptime: " + up);

  // — SUNRISE-ERKENNUNG —
  if (sunriseOffset === null) {
    sunriseCounter = (power >= sunriseThresh) ? sunriseCounter + 1 : 0;
    if (sunriseCounter >= sunriseNeeded) {
      sunriseOffset = up;
      if (!relayState) {
        runTimeSec = 0;
        runComplete = false;
      }
      sendLog("Sonnenaufgang erkannt.");
    }
  }

  // — SUNSET-ERKENNUNG —
  if (sunriseOffset !== null) {
    sunsetCounter = (power < sunriseThresh) ? sunsetCounter + 1 : 0;
    if (sunsetCounter >= sunsetNeeded) {
      sunriseOffset = null;
      sunriseCounter = 0;
      sunsetCounter = 0;
      aboveAfterSunriseCounter = 0;
      runComplete = false;
      sendLog("Sonnenuntergang erkannt – Tagesende.");
    }
  }

  let prevExpected = expectedRelayState;

  // — AUTOMATISCHER START (einmal pro Tag) —
  if (!runComplete && sunriseOffset !== null && !prevExpected) {
    aboveAfterSunriseCounter = (power > onMorningThreshold)
      ? aboveAfterSunriseCounter + 1 : 0;
    if (up >= sunriseOffset + delayAfterSunrise ||
        aboveAfterSunriseCounter >= intervalsNeeded) {
      expectedRelayState = true;
    }
  }

  // — AUTOMATISCHER STOPP bei 6h oder PV zu niedrig —
  if (prevExpected) {
    runTimeSec += timerSec;
    if (runTimeSec >= runDuration || power <= threshold) {
      expectedRelayState = false;
      runComplete = true;
    }
  }

  // — HYSTERESE EIN (wenn bisher aus) —
  if (!prevExpected && power > threshold) {
    aboveCounter++;
    if (aboveCounter >= intervalsNeeded) {
      expectedRelayState = true;
      aboveCounter = 0;
    }
  } else {
    aboveCounter = 0;
  }

  // — HYSTERESE AUS (nur erlaubt, wenn runComplete == true) —
  if (prevExpected && runComplete && power <= threshold) {
    belowCounter++;
    if (belowCounter >= intervalsNeeded) {
      expectedRelayState = false;
      belowCounter = 0;
    }
  } else {
    belowCounter = 0;
  }

  // — AUSFÜHREN NUR BEI SYNC UND ZIELWECHSEL —
  if (relayState === prevExpected && expectedRelayState !== prevExpected) {
    Shelly.call("Switch.Set", { id: 1, on: expectedRelayState });
    relayState = expectedRelayState;
    sendLog("Automatik schaltet " + (expectedRelayState ? "ein" : "aus") + ".");
  }
});

// ——— ENERGIESTATISTIK (jede Minute) ———
Timer.set(60 * 1000, true, function() {
  let pvArr = Shelly.getComponentStatus("switch", 0).aenergy.by_minute || [];
  let ppArr = Shelly.getComponentStatus("switch", 1).aenergy.by_minute || [];
  if (pvArr.length && ppArr.length) {
    let pv = pvArr[0], pp = ppArr[0];
    pvSumWh     += pv;
    pumpSumWh   += pp;
    if (pv < pp) netzbezugWh += (pp - pv);
    else         ueberschussWh += (pv - pp);
  }
});

// ——— ZUSTAND SPEICHERN (jede Minute) ———
Timer.set(60 * 1000, true, function() {
  let st = {
    rT: runTimeSec,
    rC: runComplete ? 1 : 0,
    eR: expectedRelayState ? 1 : 0,
    sO: sunriseOffset || 0,
    rS: relayState ? 1 : 0,
    p:  pvSumWh,
    P:  pumpSumWh,
    n:  netzbezugWh,
    u:  ueberschussWh
  };
  try {
    Shelly.call("Text.SetConfig", {
      id: textComponentId,
      config: {
        name: "Pumpenstatus",
        text: JSON.stringify(st),
        meta: { ui: { view: "label" } }
      }
    });
  } catch (e) {
    print("PersistError: " + e);
  }
});
