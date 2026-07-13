# Fachwerk Bus-Simulator (KNXnet/IP) — M1
# Nur Standardbibliothek, daher schlankes Basis-Image ohne Extra-Abhängigkeiten.
FROM python:3.12-slim

WORKDIR /app
COPY knxnet_sim.py selftest.py ./

# Selbsttest beim Build (schlägt fehl, wenn die Protokoll-Zustandsmaschine bricht)
RUN python selftest.py

EXPOSE 3671/udp
ENTRYPOINT ["python", "knxnet_sim.py"]
CMD ["--port", "3671"]
