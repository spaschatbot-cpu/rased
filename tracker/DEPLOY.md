# Running the listener

The site cannot be the thing a Teltonika talks to. The device opens a raw TCP
socket to a fixed IP and speaks binary; Vercel answers HTTPS and holds no socket
open. So this one small process runs on a box of its own, decodes, and posts
JSON to `/api/devices`.

The box below is the one in service. Anything with the same shape will do — the
only properties the device cares about are *a fixed address* and *a port that
stays open*.

| | |
|---|---|
| Instance | `i-0e1a55af9f8466f72` · `t4g.nano` (arm64) · Amazon Linux 2023 |
| Region | `ap-south-1` (Mumbai) |
| Address | **`3.6.185.78`** — an Elastic IP, so it survives a stop/start |
| Security group | `sg-00dd28b40b2fa87da` — SSH 22 from one address, TCP 5027 from anywhere |
| Cost | ~$7.30/month: instance ~$3.00, 8 GB disk ~$0.70, IPv4 ~$3.60 |

5027 is open to the whole internet because a SIM's address is not knowable in
advance. That is what `DEVICE_INGEST_SECRET` is for: the port accepts a
connection from anyone, but nothing reaches the database without the shared
secret, and an unknown IMEI is refused before any write.

## Install

```sh
sudo dnf install -y nodejs22            # 18+; the code uses global fetch
sudo mkdir -p /opt/rased-tracker
sudo chown "$USER" /opt/rased-tracker
scp tracker/codec8.js tracker/server.js <host>:/opt/rased-tracker/
```

`server.js` is an ES module, so the directory needs its own manifest — without
it Node reads the `.js` as CommonJS and the `import` on line 17 is a syntax
error:

```sh
printf '{\n  "name": "rased-tracker",\n  "private": true,\n  "type": "module"\n}\n' \
  > /opt/rased-tracker/package.json
```

There are no dependencies to install. The listener is `node:net` and the decoder
is arithmetic.

## Configure

`DEVICE_INGEST_SECRET` must be the *same string* here and in the Vercel project.
The file is `640 root:tracker` because it is the only secret on the box:

```sh
sudo tee /etc/rased-tracker.env >/dev/null <<EOF
API_BASE=https://rased-lime.vercel.app/api
DEVICE_INGEST_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
PORT=5027
EOF
sudo chmod 640 /etc/rased-tracker.env
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tracker
sudo chgrp tracker /etc/rased-tracker.env
```

## Run

The unit is at `/etc/systemd/system/rased-tracker.service`. It runs as `tracker`
rather than root — the port is above 1024, so nothing needs privilege — and the
sandboxing lines are there because the process's whole job is two files and one
socket; anything it reaches beyond that is a bug or an intrusion.

```ini
[Unit]
Description=Rased Teltonika TCP listener
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tracker
Group=tracker
WorkingDirectory=/opt/rased-tracker
EnvironmentFile=/etc/rased-tracker.env
ExecStart=/usr/bin/node /opt/rased-tracker/server.js
Restart=always
RestartSec=5
SyslogIdentifier=rased-tracker
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
MemoryMax=200M

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now rased-tracker
sudo journalctl -u rased-tracker -f
```

`Restart=always` matters more than it looks. The service refuses to start
without both variables (`server.js` exits 2), and it drops a connection rather
than acknowledge a frame the API would not take — both of which are restarts,
not silent degradation. A device whose fixes were never acknowledged sends them
again.

## Point the device at it

Over SMS, to the SIM in the unit. Every command takes **two leading spaces**
where the password would be, on a unit with no configurator password set:

```
  setparam 2004:3.6.185.78
  setparam 2005:5027
  setparam 2006:0
```

`2004` domain, `2005` port, `2006` protocol (0 = TCP). `2001`/`2002`/`2003` are
the APN and its credentials, if the SIM needs them.

## Prove it

`fake-device.mjs` speaks the same protocol the unit does — the handshake, a
Codec 8 frame, the acknowledgement — so a run of it exercises everything between
the socket and the map:

```sh
node tracker/fake-device.mjs 864454079569400 3.6.185.78 5027
```

Read the result in the journal, not in the client's output. The client is
satisfied by an acknowledgement, and the server acknowledges *after* the API
stores the fixes, so it is the server's line that tells you a write happened:

```
imei   …:38745 864454079569400
store  864454079569400 5 fix(es) -> 6716 ATA recorded=5 alerts=0
```

`api 404: no route for /api/devices` means the deployment predates the route.
`api 401` means the two halves of `DEVICE_INGEST_SECRET` disagree. `api 404: no
vehicle` means the IMEI is not registered against a vehicle in the production
store — the device is talking, and the fleet has never heard of it.
