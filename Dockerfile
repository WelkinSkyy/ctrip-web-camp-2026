FROM caddy
COPY ["./esu-customer/dist", "/srv"]
COPY ["./esu-admin/dist", "/srv/admin"]
COPY ["Caddyfile", "/etc/caddy/Caddyfile"]