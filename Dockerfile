# note that order matters in terms of docker build layers. Least changed near start to most changed...
# This image will be based on the official nodejs docker image
FROM node:12.9.1-buster

EXPOSE 80
ENV PORT 80
ENV MAGICK_TEMPORARY_PATH /tmp
COPY ./imagemagick-policy.xml /etc/ImageMagick-6/policy.xml

# Commands will run in this directory
RUN mkdir /srv/app
WORKDIR /srv/app

# Dependencies from package manager
RUN apt-get update && apt-get install -y tesseract-ocr g++ imagemagick xpdf ghostscript

# Add build file
COPY ./package.json package.json

# Install dependencies and generate production dist
ARG NPM_TOKEN
COPY .npmrc-deploy .npmrc
RUN npm install
RUN rm -f .npmrc

# Copy the code for the prod container.
# This seems to not cause any problems in dev when we mount a volume at this point.
COPY ./app app
COPY ./config config

CMD npm start
