FROM prom/prometheus:v3.14.0 AS prometheus
FROM alpine:3.22
RUN apk add --no-cache gettext
COPY --from=prometheus /bin/prometheus /bin/prometheus
COPY --from=prometheus /bin/promtool /bin/promtool
COPY prometheus.yml.template /etc/prometheus/prometheus.yml.template
COPY alerts.yml /etc/prometheus/alerts.yml
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
