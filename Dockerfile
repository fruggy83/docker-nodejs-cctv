FROM m03geek/ffmpeg-opencv-node:alpine
RUN apk update && apk add -u --no-cache python make g++
RUN npm i opencv4nodejs

ENV CCTV_INPUTURL=""
ENV CCTV_OUTPUTURL=""
ENV CCTV_CAMFPS=8

ADD app /usr/src/app

WORKDIR /usr/src/app/server

RUN npm install

EXPOSE 3000

CMD ["npm", "start"]

