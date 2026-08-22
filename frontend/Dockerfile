FROM nginx:1.27-alpine
ARG API_URL=/api
ARG NGINX_CONFIG=nginx.conf
COPY . /usr/share/nginx/html
RUN sed -i "s|__API_URL__|${API_URL}|g" /usr/share/nginx/html/config.js \
    && asset_version="$(sha256sum /usr/share/nginx/html/styles.css /usr/share/nginx/html/i18n.js /usr/share/nginx/html/app.js | sha256sum | cut -c1-12)" \
    && sed -i "s|__ASSET_VERSION__|${asset_version}|g" /usr/share/nginx/html/index.html
COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
EXPOSE 80
