FROM prom/alertmanager:v0.34.0 AS alertmanager
FROM alpine:3.22
RUN apk add --no-cache gettext
COPY --from=alertmanager /bin/alertmanager /bin/alertmanager
COPY --from=alertmanager /bin/amtool /bin/amtool
COPY alertmanager.yml.template /etc/alertmanager/alertmanager.yml.template
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
