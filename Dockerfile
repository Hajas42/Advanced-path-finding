FROM python:3.7

# Setup the 'app' user and its home directory
RUN mkdir -p /home/app
RUN addgroup --system app && adduser --system --group app
ENV HOME=/home/app
ENV APP_HOME=/home/app/web
RUN mkdir $APP_HOME
RUN chown -R app:app $HOME
WORKDIR $APP_HOME

# Install dependencies and copy stuff over
COPY ./apf ./apf
COPY ./requirements.txt ./requirements.txt
COPY ./docker-entry.sh ./docker-entry.sh
RUN pip install -r ./requirements.txt

# Drop to user and start the server
USER app
ENTRYPOINT ["/home/app/web/docker-entry.sh"]