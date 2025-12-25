#!/bin/bash
echo "setting env"
while IFS='=' read -r key value; do
    [[ -z $key || $key == \#* ]] && continue
    export "$key=${value//[\'\"]}"
done < .env