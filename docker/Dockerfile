FROM rabbitmq:3.10.2-management

ADD rabbit.sh .
ADD --chown=rabbitmq:rabbitmq erlang.cookie ${RABBIT_BASEDIR}/var/lib/rabbitmq/.erlang.cookie
RUN chmod +x rabbit.sh

EXPOSE 4369 \
  25672

CMD ./rabbit.sh
