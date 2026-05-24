# Eclipse Soria Map

## Goal

Create a webapplication that allows to visualize a map about the solar eclipse of 2026 in Soria. The app will
be hosted freely in Github Pages, so it needs to be standalone and as light as possible.

## Specification

We will precompute online the following layers that could be enabled or disabled by the user:

- Elevation/altitude of the province of Soria. This will be downloaded from MDT200 - 2ª cobertura, with a resolution of 25m
- Horizon elevation in degrees, in the direction of the eclipse which is 284 degrees azimut. Assuming flat earth and a height of the person of 1.5 meters
- Goodness of the site for seeing the eclipse. Red for points with an elevation higher than 7, yellow gradient from 7 to 5, green gradient from 5 to 0.

By default a political map of Soria will be shown, with cities, roads and rivers. This landmarks should be visible
when enabling our custom layers