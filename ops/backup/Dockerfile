FROM postgres:17-alpine
RUN apk add --no-cache bash restic tzdata util-linux
COPY backup.sh restore-test.sh scheduler.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh /usr/local/bin/scheduler.sh
ENTRYPOINT ["/usr/local/bin/scheduler.sh"]
