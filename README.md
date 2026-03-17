# Shelly Panel

A single-page home automation dashboard designed to run full-screen on a dedicated iPhone 7+ mounted on a wall. It polls local Shelly smart devices and public weather APIs to display live data in a clean, dark landscape layout.

---

## What It Shows

| Card | Data |
|------|------|
| Water Temperature | Hot water temp from Shelly Plus 1 add-on sensor |
| Air Temperature | Indoor ambient temp from same sensor |
| Boiler Timer | Whether boiler (or backup) is ON, with countdown remaining |
| Power | Combined live power draw from both boiler relays (kW) |
| Today's Forecast | Weather icon (colour-coded), city, and description |
| Outdoor Temperature | Current temp + today's low/high range |
| Moon | Phase drawn as a geometric SVG sphere, phase name, Hebrew date, Jewish holiday (if any) |
| Sunrise / Sunset | Today's times |

The layout is **4 columns × 2 rows** in landscape and automatically reflows to **2 columns × 4 rows** in portrait.

A status bar at the bottom shows five connectivity dots (one per data source) and the last Shelly update time.

---

## Architecture

```
iPhone (Safari, full-screen home screen app)
    │
    │  HTTP, local network only
    ▼
Raspberry Pi (192.168.68.53:8181)
    └── Python http.server serves index.html

index.html fetches directly from:
    ├── Shelly .87  (192.168.68.87) — temperature sensor
    ├── Shelly .76  (192.168.68.76) — boiler relay
    ├── Shelly .77  (192.168.68.77) — boiler backup relay
    ├── Open-Meteo  (api.open-meteo.com) — weather, free, no API key
    └── Hebcal      (hebcal.com/converter, hebcal.com/hebcal) — Hebrew date + holidays, free, no API key
```

Everything runs in a **single static HTML file** — no build tools, no frameworks, no dependencies. The Pi just serves the file; all logic runs in the browser.

---

## Devices

All devices are **Shelly Gen2 / Shelly Plus** using the RPC API.

| IP | Name | Model | Role |
|----|------|-------|------|
| 192.168.68.87 | Temperature | Shelly Plus 1 (SNSW-001X16EU) | Two add-on temp sensors |
| 192.168.68.76 | Boiler | Shelly Plus 1PM (SNSW-001P16EU) | Boiler relay + power meter |
| 192.168.68.77 | Boiler Backup | Shelly Plus 1PM (SNSW-001P16EU) | Boiler relay + power meter |

### Sensor Mapping (.87)
- `temperature:100` — water temperature (~41°C)
- `temperature:101` — air/ambient temperature (~24°C)
- `switch:0.temperature` — device chip temp (ignored)

### Boiler Timer Logic (.76 and .77)
- Boilers are configured with `auto_off: true`, `auto_off_delay: 4800s` (80 min)
- When ON: status contains `timer_started_at` (unix timestamp) and `timer_duration` (seconds)
- Time remaining = `timer_started_at + timer_duration − sys.unixtime`
- The page does a local JS countdown every second between 15-second Shelly polls

---

## CORS — Why the Shelly Scripts Exist

Browsers block cross-origin requests unless the server sends `Access-Control-Allow-Origin` headers. Shelly devices do not send these by default.

The two scripts (`shelly_script_boiler.js`, `shelly_script_temp.js`) are deployed directly onto each Shelly device (Script slot 1). They register an HTTP endpoint at `/script/1/status` that:
1. Calls `Shelly.GetStatus` internally
2. Reflects the request's `Origin` header back in the response

This allows the page to fetch device data from any origin, including local network HTTP from an iPhone.

### Deploying / Redeploying a Shelly Script
If a device is reset and the script needs to be redeployed:
1. Open the Shelly web UI at its IP address
2. Go to **Scripts → Create Script**
3. Paste the contents of the relevant `.js` file
4. Save, then **Start** the script
5. Go to **Scripts → Settings** and enable **Run on startup**

---

## Raspberry Pi Host

The Pi runs a simple Python HTTP server as a systemd service so the panel is available immediately on boot.

### Service setup (already configured)
```bash
# File served from:
/home/pi/index.html

# Service: /etc/systemd/system/shelly-panel.service
[Unit]
Description=Shelly Panel
After=network.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 8181 --directory /home/pi
WorkingDirectory=/home/pi
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
# Useful commands
sudo systemctl status shelly-panel
sudo systemctl restart shelly-panel
sudo systemctl enable shelly-panel   # auto-start on boot
```

### Deploying updates
```bash
scp index.html pi@192.168.68.53:/home/pi/index.html
# Password: OctNoam2010
```

Or via Python (used during development):
```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.68.53', port=22, username='pi', password='OctNoam2010')
sftp = ssh.open_sftp()
sftp.put('index.html', '/home/pi/index.html')
sftp.close(); ssh.close()
```

### Requirements for a replacement Pi (or any local host)
- Any Linux machine on the same local network
- Python 3 (pre-installed on all Raspberry Pi OS variants)
- Port 8181 open (not blocked by firewall)
- A static IP, or a DHCP reservation in your router so the IP doesn't change
- The systemd service above, or any equivalent always-on HTTP server

---

## Polling Intervals

| Source | Interval |
|--------|----------|
| Shelly devices | Every **15 seconds** |
| Weather (Open-Meteo) | Every **20 minutes** |
| Hebrew date + holidays (Hebcal) | Every **20 minutes** |
| Boiler countdown | Local JS tick every **1 second** |
| Moon phase | Calculated client-side, no network call |

---

## iPhone Setup

1. Open Safari and navigate to `http://192.168.68.53:8181`
2. Tap the Share button → **Add to Home Screen**
3. Open the icon — it launches full-screen
4. Settings → Display & Brightness → Auto-Lock → **Never** (to keep the screen on)
5. Optionally enable **Guided Access** (Settings → Accessibility → Guided Access) to lock the phone to the panel

---

## Expanding / Upgrading

### Adding a new Shelly device
1. Note its local IP address
2. Add it to the `DEVICES` config at the top of the `<script>` section in `index.html`
3. Deploy the CORS script (see above) to the new device
4. Add a new HTML card in the relevant column and fetch its data in `pollShelly()`
5. Add a new status dot in the status bar

### Adding a SolarEdge inverter
The inverter is at `192.168.68.62`. Modbus TCP is not currently enabled on it — contact the installer to enable local API access or obtain a cloud API key from the SolarEdge monitoring portal (Site ID: **1892529**). Once available, a power generation card can be added to the panel alongside the boiler power card.

### Adding a new weather metric
Open-Meteo supports many free variables. Add the variable name to the `&daily=` or `&current=` parameter in the `pollWeather()` URL, then read it from the response and update the relevant card.

### Changing the location
Update `WEATHER_LAT`, `WEATHER_LON`, and `WEATHER_CITY` at the top of the script section. The Hebcal API uses the Gregorian date only (no location needed).

### Changing the boiler auto-off time
Update `AUTO_OFF_DELAY` (in seconds) at the top of the script. This must match the value configured in the Shelly Switch settings (`auto_off_delay`).

### Layout / styling
- All colours are CSS variables defined in `:root` at the top of the `<style>` block
- Card font sizes use `.card-value` (64px) for primary data, `.card-unit` for units, `.card-label` for titles
- The 4-col landscape / 2-col portrait reflow is controlled by a single `@media (orientation: portrait)` block
- All cards use `position: relative`; sub-labels (ranges, descriptions) are pinned with `position: absolute` so they don't affect the vertical centering of the main value
