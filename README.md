# Shelly‑2PM PV Pool Control

Automatisierte Steuerung einer Poolpumpe über Photovoltaik‑Überschuss mit **Shelly Pro 2PM** – inklusive Sunrise/Sunset‑Logik, Hysterese, manueller Übersteuerung und Tagesstatistik, optional protokolliert in Google Sheets.

---

## Funktions‑Highlights

| Feature | Beschreibung |
|---------|--------------|
| PV‑abhängiges Schalten | Die Pumpe läuft nur, wenn die PV‑Leistung längere Zeit oberhalb einer einstellbaren Schwelle liegt (Standard 580 W). |
| Sunrise/Sunset‑Erkennung | Tagesanfang/‑ende wird live anhand der PV‑Leistung erkannt – kein externer Sonnenaufgangs‑API nötig. |
| Frühstart & Hysterese | Optionaler Frühstart bei starkem Morning‑Peak (> 400 W) sowie 5‑Minuten‑Ein/Aus‑Hysterese zur Vermeidung von Taktbetrieb. |
| Maximale Laufzeit | Begrenzung auf 6 h/Tag; Abschaltung auch bei nachlassender PV‑Leistung. |
| Manuelle Steuerung | Jederzeitiges Ein/Aus über einen an **INPUT 1** angeschlossenen Taster. |
| Livedaten & Logging | Minütliche Energiewerte (PV, Pumpe, Netzbezug, Überschuss) sowie Ereignis‑Logs per HTTP‑POST an ein Google‑Sheet. |

---

## Hardware‑/Software‑Voraussetzungen

* **Shelly Pro 2PM** (Firmware ≥ 1.3.0 empfohlen)  
* **Kanal 0** → misst PV‑Leistung (z. B. über externen Strommesswandler)  
  **Kanal 1** → schaltet & misst die Poolpumpe  
* Optional: Taster auf **INPUT 1** für manuelles Übersteuern  
* WLAN‑Zugang (für Zeitserver & ggf. Google‑Sheets‑Logging)

---

## Schnellstart

1. **Shelly‑Skript importieren**  
   * In der Web‑UI **Scripts → Create New Script** wählen,  
     Inhalt aus `shellyscript.js` kopieren.  
   * In **Zeile 13** die Variable `googleUrl` mit der späteren WebApp‑URL befüllen (oder `""`, falls kein Logging).  
2. **Parameter anpassen** (siehe Abschnitt *Konfiguration*).  
3. **Script speichern & starten** → Die Pumpe sollte zunächst *aus* sein; im Log erscheint „Programm neu gestartet“.  
4. **Google‑Sheet einrichten** (optional)  
   * Neues Spreadsheet anlegen → **Erweiterungen → Apps Script** → Inhalt aus `appscript.gs` einfügen.  
   * **Deploy → Web‑App** → *Execute as* **Me**, *Access* **Anyone** → **Deploy**.  
   * Die Executable‑URL anschließend in `googleUrl` im Shelly‑Skript eintragen.

---

## Konfiguration

Alle Schwellwerte befinden sich am Kopf von `shellyscript.js`.

| Variable | Vorgabe | Bedeutung |
|----------|---------|-----------|
| `threshold` | `580` W | PV‑Leistung, ab der (nach 5 min) eingeschaltet wird |
| `onMorningThreshold` | `400` W | Frühstart‑Schwelle vor Ablauf der Wartezeit |
| `sunriseThresh` | `1` W | „Es wird hell“, sobald PV 5 min > 1 W |
| `delayAfterSunrise` | `4 h` | Wartezeit nach Sonnenaufgang, bevor Auto‑Start erlaubt |
| `runDuration` | `6 h` | Maximale Pumpenlaufzeit pro Kalendertag |
| `timerSec` | `10` s | Zykluszeit der Hauptlogik (nicht ändern, falls unsicher) |

Alle Zeiten werden in Sekunden bzw. Watt angegeben; bei Änderungen stets das Skript neu starten.

---

## Betriebsablauf (vereinfacht)

```mermaid
graph TD
  A[Gerätestart] --> B{PV-Leistung > sunriseThresh<br/>5 min?}
  B -- nein --> B
  B -- ja --> C[Sunrise erkannt<br/>Startfenster = +4 h]
  C --> D{PV > onMorningThreshold<br/>5 min?}
  D -- ja --> E[Frühstart]
  D -- nein --> F{Zeit >= Startfenster?}
  F -- ja --> G[Planmäßiger Start]
  G --> H{PV <= threshold<br/>5 min ODER<br/>6 h Laufzeit}
  H -- ja --> I[Ausschalten<br/>runComplete = true]
  I --> J{Sunset erkannt<br/>(PV < sunriseThresh<br/>30 min)}
  J -- ja --> K[Tagesstatistik → Google‑Sheet<br/>Zähler zurücksetzen]
```

---

## Sicherheitshinweise

* **Netzspannung!** Arbeiten am 230 V‑Netz nur durch Fachpersonal.  
* Verwende geeignete Schutzschalter (RCD/RCBO) und dimensioniere Verdrahtung & Relais nach Pumpenleistung.  
* Prüfe, ob deine Pumpe häufiges Ein/Aus verträgt; passe die Hysterese bei Bedarf an.

---

## Fehlersuche

* **Script läuft nicht?** – Web‑UI → *Scripts* → *View Log*.  
* **Keine Einträge im Google‑Sheet?** – Überprüfe die Exec‑URL und die Berechtigungen der Web‑App.  
* **Pumpe startet zu spät/früh?** – `threshold`, `onMorningThreshold` oder `delayAfterSunrise` anpassen.

---

## Contributing

Pull‑Requests (Code‑Cleanup, Funktionen, Bugfixes) und Issues sind willkommen. Bitte vor größeren Änderungen kurz ein Issue aufmachen.

---

## Lizenz

Dieses Projekt steht ohne Gewähr unter der **MIT‑Lizenz** (siehe `LICENSE`). Nutzen auf eigene Gefahr – der Autor haftet nicht für mögliche Schäden.

---

☀️ Viel Spaß beim stromsparenden Poolbetrieb!
