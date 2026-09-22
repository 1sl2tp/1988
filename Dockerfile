FROM gradle:8.11-jdk17 AS build
WORKDIR /app
COPY backend/newpipe/ /app/
RUN gradle clean installDist --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/install/newpipe-service/ /app/
ENV PORT=10000
EXPOSE 10000
CMD ["bin/newpipe-service"]
