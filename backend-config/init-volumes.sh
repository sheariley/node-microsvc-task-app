chown -R 1001:1001 /run/logs
setfacl -R -m u:10001:r-x /var/log
