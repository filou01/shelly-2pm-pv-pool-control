// Shelly 2PM: PV-gesteuerte Pumpe mit Sunrise-/Sunset-Erkennung,
// 6h Maximaldauer, automatischer und manueller Steuerung, Tagesstatistik

// ——— KONFIGURATION ———
let threshold = 580;                  // W: Schwelle für Hysterese – Pumpe wird eingeschaltet, wenn PV-Leistung länger darüber liegt
let onMorningThreshold = 400;         // W: Wenn PV-Leistung morgens dauerhaft über diesem Wert liegt, darf die Pumpe vorzeitig starten
let sunriseThresh = 1;                // W: Unterhalb dieser Leistung wird es als "Nacht" gewertet (Sunrise/Sunset-Erkennung)
let delayAfterSunrise = 4 * 3600;     // Sekunden: Wartezeit nach erkanntem Sonnenaufgang, bevor automatischer Start erlaubt ist
let runDuration = 6 * 3600;           // Sekunden: Maximale Pumpenlaufzeit pro Tag
let timerSec = 10;                    // Sekunden: Haupt-Logik wird alle 10s ausgeführt
let intervalsNeeded = (5 * 60) / timerSec;        // 5 Minuten über/unter threshold für Ein-/Ausschalt-Hysterese
let sunriseNeeded = (5 * 60) / timerSec;         // 5 Minuten über sunriseThresh nötig für Sunrise-Erkennung
let sunsetNeeded = (30 * 60) / timerSec;          // 60 Minuten unterhalb sunriseThresh = Sunset

let googleUrl = "https://script.google.com/macros/s/xxxxxxxxxxxxx/exec";

// ——— ZUSTANDSVARIABLEN ———
let relayState = false;             // Aktueller Schaltzustand der Pumpe
let aboveCounter = 0;               // Zähler für Hysterese-Einschaltbedingung
let belowCounter = 0;               // Zähler für Hysterese-Ausschaltbedingung
let sunriseCounter = 0;             // Zähler für Sunrise-Erkennung
let aboveAfterSunriseCounter = 0;   // Zähler für Frühstart bei hoher Leistung vor geplanter Startzeit
let sunriseOffset = null;           // Zeitpunkt des Sunrise (Sekunden seit Start)
let runStartOffset = null;          // Zeitpunkt des Pumpenstarts
let sunsetCounter = 0;              // Zähler für Sunset-Erkennung
let runComplete = false;            // Flag: Tageslauf der Pumpe wurde abgeschlossen

// ——— TAGESZÄHLER (in Milliwattstunden) ———
let pvSumWh = 0;                    // PV-Ertrag gesamt
let pumpSumWh = 0;                  // Pumpenverbrauch gesamt
let netzbezugWh = 0;                // Anteil des Pumpenverbrauchs, der nicht durch PV gedeckt wurde
let ueberschussWh = 0;              // PV-Leistung, die nicht für die Pumpe gebraucht wurde

// ——— LOGGING-FUNKTION via HTTP ———
function sendLog(msg) {
  print(msg);
  try {
    let uptime = Shelly.getComponentStatus("sys").uptime;
    let body = JSON.stringify({ log: msg });
    Shelly.call("http.request", {
      method: "POST",
      url: googleUrl,
      headers: { "Content-Type": "application/json" },
      body: body
    }, function (result, code, err) {
      if (code === 0) {
        print("Log erfolgreich gesendet: " + result.code);
      } else {
        print("HTTP-POST-Fehler: " + code + " / " + err);
      }
    });
  } catch (e) {
    print("sendLog-Fehler: " + e);
  }
}

// ——— FUNKTION: Formatierung von Energieeinträgen (mWh → Wh oder kWh) ———
function formatEnergy(mWh) {
  let wh = mWh / 1000;
  return wh >= 1000 ? (wh / 1000).toFixed(2) + " kWh" : wh.toFixed(1) + " Wh";
}

// Beim Skriptstart: sicherstellen, dass Pumpe ausgeschaltet ist
Shelly.call("Switch.Set", { id: 1, on: false });
sendLog("Programm neu gestartet.");

// Speichert den Startzeitpunkt des Tageslaufs
function markRunStart(uptime) {
  if (runStartOffset === null) {
    runStartOffset = uptime;
  }
}

// ——— MANUELLES EIN-/AUSSCHALTEN ÜBER EINGANG ———
Shelly.addEventHandler(function (event) {
  if (event.name !== "input") return;

  // Pumpe manuell ausgeschaltet
  if (event.id === 1 && !event.info.state && relayState && runComplete) {
    Shelly.call("Switch.Set", { id: 1, on: false });
    relayState = false;
    sendLog("Du hast die Pumpe manuell ausgeschaltet.");
  }

  // Pumpe manuell eingeschaltet
  if (event.id === 1 && event.info.state && !relayState) {
    Shelly.call("Switch.Set", { id: 1, on: true });
    relayState = true;
    markRunStart(Shelly.getComponentStatus("sys").uptime);
    sendLog("Du hast die Pumpe manuell eingeschaltet.");
  }
});

// ——— HAUPT-TIMER: wird alle 10s ausgeführt ———
Timer.set(timerSec * 1000, true, function () {
  let up = Shelly.getComponentStatus("sys").uptime;

  // Wenn das Gerät gerade erst gestartet wurde und PV-Leistung > 100 W → runComplete setzen
  if (up < 300) {
    let initPower = Math.abs(Shelly.getComponentStatus("switch", 0).apower);
    if (initPower > 100 && !runComplete) {
      runComplete = true;
      sendLog("Anlage frisch gestartet. Tageslauf wird als erledigt markiert, da PV-Leistung bereits hoch ist.");
    }
  }

  // Eingänge prüfen – wenn manuell aktiv, Automatik pausieren
  let sw0 = Shelly.getComponentStatus("input", 0).state;
  let sw1 = Shelly.getComponentStatus("input", 1).state;
  if (sw0 || sw1) return;

  let power = Math.abs(Shelly.getComponentStatus("switch", 0).apower);
  print("Leistung: " + power + " W, uptime: " + up);

  // — Sunrise-Erkennung — wenn Leistung mehrere Minuten über sunriseThresh bleibt
  if (!runComplete && sunriseOffset === null) {
    if (power >= sunriseThresh) {
      sunriseCounter++;
    } else {
      sunriseCounter = 0; // Reset bei Unterschreitung
    }
    if (sunriseCounter >= sunriseNeeded) {
      sunriseOffset = up;
      sendLog("Sonnenaufgang erkannt – PV-Leistung stabil.");
    }
  }

  // — Sunset-Erkennung + Tagesstatistik — bei dauerhafter niedriger PV-Leistung
  if (sunriseOffset !== null) {
    if (power < sunriseThresh) {
      sunsetCounter++;
    } else {
      sunsetCounter = 0; // Reset bei Überschreitung
    }
    if (sunsetCounter >= sunsetNeeded) {
        sunriseOffset = null;
        runStartOffset = null;
        sunriseCounter = 0;
        sunsetCounter = 0;
        aboveAfterSunriseCounter = 0;
        runComplete = false;

        // ——— TAGESWERTE BERECHNEN ———
        let gedecktWh = (pumpSumWh - netzbezugWh) / 1000;
        let gesamtPumpWh = pumpSumWh / 1000;
        let eigennutzPump = gesamtPumpWh > 0 ? (gedecktWh / gesamtPumpWh) * 100 : 0;

        let pvVerbrauchWh = pvSumWh - ueberschussWh;
        let eigennutzGesamt = pvSumWh > 0 ? (pvVerbrauchWh / pvSumWh) * 100 : 0;

        // ——— LOGTEXT ———
        let logText =
            "Sonnenuntergang erkannt – Tagesende, Pumpe darf morgen wieder laufen.\n" +
            "Tagesstatistik:\n" +
            "- PV-Ertrag: " + formatEnergy(pvSumWh) + "\n" +
            "- Pumpenverbrauch: " + formatEnergy(pumpSumWh) + "\n" +
            "- Netzbezug: " + formatEnergy(netzbezugWh) + "\n" +
            "- PV-Überschuss: " + formatEnergy(ueberschussWh) + "\n" +
            "- Pumpenverbrauch PV-Anteil: " + eigennutzPump.toFixed(1) + " %\n" +
            "- PV-Eigennutzung (gesamt): " + eigennutzGesamt.toFixed(1) + " %";

        sendLog(logText);

        // Tageszähler zurücksetzen
        pvSumWh = 0;
        pumpSumWh = 0;
        netzbezugWh = 0;
        ueberschussWh = 0;

        return;
    }
  }

  // — Automatischer Start bei ausreichend PV nach delay oder hohem Morning-Peak
  if (!runComplete && sunriseOffset !== null && !relayState) {
    let windowStart = sunriseOffset + delayAfterSunrise;

    if (up >= windowStart) {
      Shelly.call("Switch.Set", { id: 1, on: true });
      relayState = true;
      markRunStart(up);
      sendLog("Geplanter Start nach Sonnenaufgang – Pumpe wurde eingeschaltet.");
      return;
    } else {
      // Frühstart bei dauerhaft hoher PV-Leistung
      if (power > onMorningThreshold) {
        aboveAfterSunriseCounter++;
      } else {
        aboveAfterSunriseCounter = 0;
      }

      if (aboveAfterSunriseCounter >= intervalsNeeded) {
        Shelly.call("Switch.Set", { id: 1, on: true });
        relayState = true;
        markRunStart(up);
        sendLog("Frühstart: PV-Leistung war 5 Minuten lang hoch – Pumpe wird vorzeitig eingeschaltet.");
        return;
      }
    }
  }

  // — Überwachung des laufenden Pumpenvorgangs
  if (relayState && runStartOffset !== null) {
    if (!runComplete && up < runStartOffset + runDuration) {
      // Noch innerhalb erlaubter Laufzeit
      aboveCounter = belowCounter = 0;
      return;
    }

    if (power <= threshold) {
      // Nach max. Laufzeit oder zu wenig PV → ausschalten
      Shelly.call("Switch.Set", { id: 1, on: false });
      relayState = false;
      aboveCounter = belowCounter = 0;
      runComplete = true;
      sendLog("Laufzeit voll oder PV-Leistung zu niedrig – Pumpe wurde ausgeschaltet.");
      return;
    }

    // Wenn PV-Leistung weiterhin hoch: nichts tun
    aboveCounter = belowCounter = 0;
  }

  // — Automatische Ein-/Ausschaltung über 10-Minuten-Hysterese
  if (!relayState) {
    if (power > threshold) {
      aboveCounter++;
    } else {
      aboveCounter = 0;
    }

    if (aboveCounter >= intervalsNeeded) {
      Shelly.call("Switch.Set", { id: 1, on: true });
      relayState = true;
      markRunStart(up);
      aboveCounter = belowCounter = 0;
      sendLog("Hysterese: Pumpe automatisch eingeschaltet (PV-Leistung > " + threshold + " W).");
    }

  } else {
    if (power <= threshold) {
      belowCounter++;
    } else {
      belowCounter = 0;
    }

    if (belowCounter >= intervalsNeeded) {
      Shelly.call("Switch.Set", { id: 1, on: false });
      relayState = false;
      aboveCounter = belowCounter = 0;
      sendLog("Hysterese: Pumpe automatisch ausgeschaltet (PV-Leistung ≤ " + threshold + " W).");
    }
  }
});

// ——— ENERGIESTATISTIK MINÜTLICH ———
Timer.set(60 * 1000, true, function () {
  let pvArray = Shelly.getComponentStatus("switch", 0).aenergy.by_minute;
  let pumpeArray = Shelly.getComponentStatus("switch", 1).aenergy.by_minute;

  if (!pvArray || !pumpeArray || pvArray.length < 1 || pumpeArray.length < 1) return;

  let pv = pvArray[0];       // mWh
  let pumpe = pumpeArray[0]; // mWh

  pvSumWh += pv;
  pumpSumWh += pumpe;

  if (pv < pumpe) {
    netzbezugWh += (pumpe - pv);
  } else {
    ueberschussWh += (pv - pumpe);
  }
});
