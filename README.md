# Shelly 2PM Gen3 – PV-gesteuerte Poolpumpe

**Ziel des Projekts:**  
Eine Pumpensteuerung, die **jeden Tag wetterunabhängig mindestens 6 Stunden** läuft,  
bei hohem PV-Überschuss jedoch **automatisch länger** arbeitet, damit du den selbst erzeugten Strom optimal nutzt.

Das **Shelly-Skript** erledigt diese Logik komplett offline:  
Sunrise/Sunset-Erkennung, Frühstart, Mindestlaufzeit ≥ 6 h und optionale Verlängerung bei viel Sonne – alles allein aus der gemessenen PV-Leistung.  
Wer eine lückenlose Protokollierung wünscht, kann das beiliegende **Google App Script** aktivieren; nur dafür ist Internet nötig.

---

## Funktions-Highlights

| Feature | Beschreibung |
|---------|--------------|
| **PV-abhängiger Start** | Erst nach 5 min PV > `threshold` (Standard 580 W). |
| **Garantierte Mindest Laufzeit 6 h** | Nach dem Start läuft die Pumpe **immer mindestens 6 h – egal wie das Wetter wird.** |
| **Automatische Verlängerung** | Ist die PV-Leistung nach 6 h immer noch hoch, läuft die Pumpe weiter, bis die Leistung 5 min lang unter `threshold` fällt. |
| **Frühstart & 5-Min-Hysterese** | Early-Start bei Morning-Peak > 400 W; Hysterese schützt vor Taktbetrieb. |
| **Sunrise/Sunset ohne Cloud** | Tagesbeginn und -ende werden rein aus den Wattwerten erkannt. |
| **Manuelle Übersteuerung** | Taster an **S1** (Input 1) schaltet jederzeit dauerhaft ein/aus. |
| **(Optional) Logging** | Minütliche PV- & Pumpen-Energie via HTTP-POST an Google Sheets. |

---

## Hardware-Setup

| Komponente | Anschluss | Hinweis |
|------------|-----------|---------|
| **Shelly 2PM Gen3** | – | Firmware ≥ 1.3.0 |
| PV-Leitung | **Kanal 0** | Misst Leistung intern – keine Stromklemme nötig |
| Poolpumpe | **Kanal 1** | Schaltet & misst |
| Taster (optional) | **S1 → GND** | Manuelles Ein/Aus |
| Internet | **nur fürs Logging** | HTTP-POST an Google-Script |

> 🔌 **Für die reine Automatik ist kein Internet erforderlich.**

---

## Installation

1. **Skript importieren**  
   * Shelly-Web-UI → **Scripts → Create New Script** → Inhalt von `shellyscript.js` einfügen.  
   * `googleUrl` (Zeile 13) leer lassen → offline; sonst Exec-URL des App Scripts eintragen.
2. **Parameter anpassen** (siehe Tabelle *Konfiguration*).  
3. **Script speichern & starten** – Log zeigt „Programm neu gestartet“.  
4. *(Optional)* **Google-Logging** – App Script deployen und Exec-URL eintragen.

---

## Konfiguration (Ausschnitt aus `shellyscript.js`)

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `threshold` | 580 W | Schwellwert für Start/Stop-Hysterese |
| `onMorningThreshold` | 400 W | Frühstart-Schwelle |
| `runDuration` | 6 h | **Mindest-**Laufzeit pro Tag |
| `delayAfterSunrise` | 4 h | Wartezeit nach Sunrise bis Auto-Start |
| `sunriseThresh` | 1 W | Grenze Tag/Nacht |
| `timerSec` | 10 s | Zykluszeit der Hauptschleife |

---

## Ablauf in Klartext

1. **Sunrise-Erkennung**  
   * PV ≥ `sunriseThresh` für 5 min → Tagesstart & Zähler-Reset.  
2. **Startfenster**  
   * Frühstart bei PV > `onMorningThreshold` 5 min  
   * oder automatischer Start nach `delayAfterSunrise`.  
3. **Betrieb**  
   * Pumpe läuft jetzt **mindestens `runDuration` (6 h)** – Abschalten ist in dieser Zeit gesperrt.  
4. **Verlängerung**  
   * Nach 6 h weiterbetrieb, solange PV > `threshold` (Hysterese 5 min).  
5. **Stopp**  
   * Sobald PV 5 min ≤ `threshold` **nach** den 6 h → Abschalten.  
6. **Sunset**  
   * 30 min PV < `sunriseThresh` → Tagesstatistik (optional Upload), Tages-Reset.

---

## Fehlersuche

| Problem | Tipp |
|---------|------|
| Keine Reaktion | Shelly-UI → *Scripts → View Log* prüfen. |
| Kein Logging | `googleUrl`, Internet & Web-App-Rechte checken. |
| Zu kurze/zu lange Laufzeit | `threshold`, `runDuration`, `onMorningThreshold`, `delayAfterSunrise` anpassen. |

---

## Contributing

Issues & Pull-Requests willkommen – bei größeren Änderungen bitte zuerst ein Issue öffnen.

---

## Lizenz

MIT – Nutzung auf eigene Gefahr.

---

☀️ Viel Spaß beim stromsparenden und wetterunabhängigen Poolbetrieb!
