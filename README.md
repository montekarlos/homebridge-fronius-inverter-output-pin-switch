
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Fronius Output Pin Plugin

This plugin allows manual control of fronius inverter output pins

It uses undocumented api so your mileage may vary. It works on my Fronius Primo running firmware v3.23.3-1

## How it works

If you manually browse to http://<your_inverter_ip>/#/settings/loadmanagement you can see there are for rules for up to four devices that
can be connected to the output pins of the fronius inverter. This plugin allow temporarily forcing these pins to be on.

## Why

I wanted this because I have a hot water system attached to one of the output pins. It's useful to be able to boost this without 
going to the manual switch outside

## What it provides

You will get three devices per configured pin: A switch to force the input pin on (boost), a light bulb to visualise if the pin is on or 
not and a light sensor which will visualise how many minutes the pin has been on for the current day.

## Configuration

Use the provided interface

## Bugs

Probably. Raise a PR.