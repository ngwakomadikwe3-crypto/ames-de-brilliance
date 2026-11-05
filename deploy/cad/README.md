# AMES CAD hosting review package

Prepared for a dedicated Linux host, Node 24, Docker, and a TLS reverse proxy. No server is provisioned and no credentials are included. This supports one worker and a durable private disk volume, not automatic horizontal scaling.

## Boundaries

Vercel owner-authenticated jewelry route → HTTPS bearer-authenticated broker → existing private Appwrite source file → persistent per-product queue → a separate restricted Blender container per job → hashed private GLB/PNG artifacts → owner-authenticated Vercel download.

The broker listens only on `127.0.0.1:3020`. Terminate TLS at a reverse proxy, cap metadata bodies at 64 KiB, and apply connection/rate limits there. Only `/health` and `/products/.../jobs` are served; all require the service token. The browser never receives that token or a direct private storage link. The owner guard, product/source binding, visual review and approval requirements remain in the web app.

## Build and review

1. Select an official Blender 5.2 Linux x64 archive from `https://download.blender.org/release/` and independently verify its SHA-256. Build from the repository root:
   ```sh
   docker build -f deploy/cad/Dockerfile.converter --build-arg BLENDER_ARCHIVE_URL="$BLENDER_ARCHIVE_URL" --build-arg BLENDER_SHA256="$BLENDER_SHA256" -t ames-converter:review .
   ```
2. Scan the image, run the representative GLB/OBJ/STL/FBX fixtures, push to your private registry, then pin the tested registry digest in `AMES_CAD_IMAGE`. The runner refuses floating tags and does not pull at runtime.
3. Create a dedicated non-root `ames-cad` user and `/var/lib/ames-cad` owned by it, mode `0700`, on an encrypted persistent disk. Add a disk quota and low-disk alerts. The worker controller alone needs Docker access, which is privileged: use a dedicated VM, not a shared application host. The importer gets no Docker socket or host credentials.
4. Install the repository and dependencies under `/opt/ames`. Install the reviewed systemd units. Store broker environment configuration in `/etc/ames-cad.env`, mode `0600`, and only `AMES_CAD_IMAGE` in `/etc/ames-cad-worker.env`. Restrict the Appwrite key to source-file reads as supported by your project; never put it in the converter image.
5. Start the broker and worker after reviewing the units, TLS configuration and firewall. Set `AMES_CAD_SERVICE_URL` (HTTPS origin) and the matching `AMES_CAD_SERVICE_TOKEN` in Vercel. Until configured, hosted conversion fails closed with an explicit unavailable response; it never writes conversion jobs to Vercel's ephemeral filesystem.

## Importer restrictions

Each job has its own mount. Containers run as the controller's non-root UID, with no network, read-only root, dropped capabilities, no new privileges, 128 PID limit, 2 CPUs, 4 GiB memory, 512 MiB temporary space and a five-minute timeout. The source hash is checked before import. Docker's default seccomp remains enabled. The broker/controller are trusted; Blender parses the untrusted CAD data without their secrets.

Native `.3dm` remains a private original requiring a GLB/OBJ/STL/FBX companion export. This package does not claim native surface tessellation or manufacturing certification.

## Operations and acceptance

- Back up the private queue/artifact disk encrypted; prove a restore to a separate staging host before launch.
- Define source/artifact retention with the business before deleting files. Never delete original Appwrite sources as part of queue cleanup.
- Monitor authenticated `/health`, failed jobs, disk usage, memory kills and queue age. Alert if heartbeat is stale. Rotate the broker token on both ends together.
- Acceptance: source upload → queued job → isolated importer → private previews → material review → approval/handoff. Test cross-product access, expired staff session, wrong token, checksum mismatch, malformed input, timeout and restart recovery.
- Docker is not installed in the preparation workspace. Image build, Linux imports, TLS, backup restore and hosted end-to-end execution remain required before enabling this service. No hosting costs have been incurred.
