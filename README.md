# Shelly 2PM Gen3 – PV-gesteuerte Poolpumpe

**Voll autonom ohne Cloud!**  
Dieses Shelly-Skript schaltet deine Poolpumpe strikt nach dem Überschuss deiner PV-Anlage.  
Der gesamte Tagesverlauf (Sunrise / Sunset, Startfenster, max. Laufzeit) wird ausschließlich aus der gemessenen Leistung berechnet – ganz ohne Internet oder externe APIs.  
Wer trotzdem ein Minütliches Logging in Google Sheets möchte, kann das optionale App Script nutzen; dafür ist dann natürlich Internetzugang erforderlich.

---

## Warum Gen3?

* **Integrierte Strommessung**: Kanal 0 misst direkt die PV-Leistung, Kanal 1 die Pumpe – keine externen Klemmen nötig.  
* **Mehr Rechenleistung & größerer Script-Speicher** – perfekt für die Logik dieses Projekts.

---

## Funktions-Highlights

| Feature | Was es tut |
|---------|------------|
| **PV-abhängiges Schalten** | Start erst nach 5 min PV > Schwellwert (Standard 580 W). |
| **Frühstart & Hysterese** | Optionaler Early-Start bei Morning-Peak > 400 W, 5-min Ein/Aus-Hysterese vermeidet Taktbetrieb. |
| **Sunrise/Sunset lokal** | Tagesanfang/-ende wird ausschließlich anhand der gemessenen Wattwerte erkannt – keine Internet-Zeit oder API nötig. |
| **Max. Laufzeit** | Pumpe läuft höchstens 6 h pro Tag; beim Erreichen wird abgeschaltet. |
| **Manuelle Übersteuerung** | Taster an **S1** (Input 1) schaltet pumpenseitig dauerhaft ein/aus. |
| **(Optional) Logging** | Minütliche Summen (PV, Pumpe, Netzbezug, Überschuss) via HTTP-POST an ein Google-Sheet. |

---

## Hardware-Setup

| Komponente | Anschluss / Hinweis |
|------------|--------------------|
| **Shelly 2PM Gen3** | Firmware ≥ 1.3.0 |
| PV-Wechselrichter­ausgang | Über **Kanal 0** führen (Leitung durch L-Eingang → Strom wird intern gemessen). |
| Poolpumpe | An **Kanal 1** anschließen – schaltet und misst gleichzeitig. |
| Optionaler Taster | Zwischen **S1** und GND für manuelles Ein-/Ausschalten. |
| (Nur bei Logging)** WLAN / Internet** | Für HTTP-POST an Google-App-Script erforderlich. |

> 🔌 **Kein Internet nötig, wenn du nur die Automatik möchtest!**

---

## Installation in 3 Schritten

1. **Skript importieren**  
   * Shelly-Web-UI → **Scripts → Create New Script** → Inhalt von `shellyscript.js` einfügen.  
   * In **Zeile 13** gilt:  
     * `googleUrl = ""` → **ohne** Logging (= komplett offline)  
     * sonst Exec-URL deines Google-App-Scripts eintragen.
2. **Parameter anpassen** (siehe Tabelle *Konfiguration*).  
3. **Script speichern & starten** – fertig. Log meldet „Programm neu gestartet“.

### Google-Logging (optional)

1. Neues Google-Spreadsheet → **Erweiterungen → Apps Script** → `appscript.gs` hinein kopieren.  
2. **Deploy → Web App**  
   * *Execute as*: **Me**  
   * *Access*: **Anyone**  
   * **Deploy** → Exec-URL in `googleUrl` übernehmen.  
3. Shelly benötigt jetzt WLAN mit Internet, um Log-Einträge zu senden.

---

## Konfiguration (Ausschnitt aus `shellyscript.js`)

| Variable | Default | Erklärung |
|----------|---------|-----------|
| `threshold` | `580` W | PV-Leistung, ab der (5 min) eingeschaltet wird. |
| `onMorningThreshold` | `400` W | Frühstart-Schwelle vor Ablauf der Wartezeit. |
| `sunriseThresh` | `1` W | Grenze, ab wann es „hell“ ist. |
| `delayAfterSunrise` | `4*3600` | Sekunden bis Auto-Start nach Sunrise. |
| `runDuration` | `6*3600` | Maximale Betriebszeit pro Tag (Sekunden). |
| `timerSec` | `10` s | Zykluszeit der Hauptschleife. |

Parameter ändern ⇒ Script neu starten, damit sie aktiv werden.

---

## Ablauf in Klartext

1. **Sunrise-Erkennung**  
   * PV > `sunriseThresh` für 5 min → Tagesstart & Timer-Reset.  
2. **Startfenster**  
   * Entweder Frühstart bei dauerhafter Leistung > `onMorningThreshold`  
   * oder automatischer Start, sobald `delayAfterSunrise` verstrichen ist.  
3. **Betrieb**  
   * Läuft, solange PV > `threshold` **und** `runDuration` noch nicht erreicht.  
4. **Stopp**  
   * Abschaltung nach 5 min PV ≤ `threshold` **oder** nach Erreichen der Tageslaufzeit.  
5. **Sunset-Erkennung**  
   * 30 min PV < `sunriseThresh` markieren Tagende → (optional) Log-Upload, Tages-Zähler zurücksetzen.

---

## Fehlersuche

* **Script läuft nicht?** Web-UI → *Scripts* → *View Log* – hier steht der Grund.  
* **Keine Log-Einträge?** Prüfe `googleUrl`, Internetverbindung & Zugriffsrechte der Web-App.  
* **Startet zu spät/früh?** Passe `threshold`, `onMorningThreshold` oder `delayAfterSunrise` an.

---

## Contributing

*Bugfixes, Verbesserungen oder neue Features?* → Fork, Issue aufmachen oder Pull-Request erstellen – herzlich willkommen!

---

## Lizenz

MIT-Lizenz (siehe `LICENSE`).  
Nutzung auf eigene Gefahr – keinerlei Haftung für eventuelle Schäden.

---

☀️ Viel Erfolg beim stromsparenden Poolbetrieb – ganz ohne Cloud!
