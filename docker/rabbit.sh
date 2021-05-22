
#!/bin/bash

chmod 600 ${RABBIT_BASEDIR}/var/lib/rabbitmq/.erlang.cookie

set -m
rabbitmq-server &
rabbitmqctl wait $RABBIT_BASEDIR/var/lib/rabbitmq/mnesia/rabbit\@$HOSTNAME.pid


if [ -n $RABBITMQ_DEFAULT_USER ] || [ -n $RABBITMQ_DEFAULT_PASS ]; then
  echo "Removing 'guest' user and adding ${RABBITMQ_DEFAULT_USER}"
  rabbitmqctl delete_user guest
  rabbitmqctl add_user $RABBITMQ_DEFAULT_USER $RABBITMQ_DEFAULT_PASS
  rabbitmqctl set_user_tags $RABBITMQ_DEFAULT_USER administrator
  rabbitmqctl set_permissions -p / $RABBITMQ_DEFAULT_PASS ".*" ".*" ".*"
fi

if [ -n "$CLUSTER_WITH" ]
then
  id

  rabbitmqctl stop_app
  rabbitmqctl join_cluster --ram rabbit@$CLUSTER_WITH
  rabbitmqctl start_app
fi

fg %1
