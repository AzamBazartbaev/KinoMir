FROM nginx:1.27-alpine
ARG API_URL=http://localhost:8000/api
COPY . /usr/share/nginx/html
RUN sed -i "s|__API_URL__|${API_URL}|g" /usr/share/nginx/html/config.js
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

