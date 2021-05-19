#!/bin/bash

mkdir -p $2
# ln -df "$1"/* "$2"
rm -Ir $2/*
cp -rf "$1"/* "$2"