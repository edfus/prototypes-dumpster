#!/bin/sh

set -e

sudo yum install -y yum-utils
sudo yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo docker run --rm hello-world

wget https://github.com/edfus/prototypes-dumpster/archive/refs/heads/master.zip
unzip master.zip
cd prototypes-dumpster/stalker
docker build -t stalker
sudo docker run -it stalker
