﻿// ==UserScript==
// @id             iitc-plugin-self-location@eccenux
// @name           IITC plugin: Self location
// @category       Misc
// @version        0.0.1
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @description    [0.0.1] Self location tracker. Your position on the map. Obviously works best on a mobile device.
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @include        https://*.ingress.com/mission/*
// @include        http://*.ingress.com/mission/*
// @match          https://*.ingress.com/mission/*
// @match          http://*.ingress.com/mission/*
// @grant          none
// @updateURL      https://github.com/Eccenux/iitc-plugin-self-location/raw/master/self-location.meta.js
// @downloadURL    https://github.com/Eccenux/iitc-plugin-self-location/raw/master/self-location.user.js
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};


//PLUGIN START ////////////////////////////////////////////////////////

/**
 * Main class of the plugin.
 *
 * Will become `window.plugin.selfLocation` singleton.
 */
function SelfLocation() {

};

/**
 * Initial initialization of the plugin.
 */
SelfLocation.prototype.init = function() {
	this.setupWatch();
	this.setupDraw();
};

/**
 * Very simple logger.
 */
function LOG() {
	var args = Array.prototype.slice.call(arguments); // Make real array from arguments
	args.unshift("[selfLocation] ");
	console.log.apply(console, args);
}
function LOGwarn() {
	var args = Array.prototype.slice.call(arguments); // Make real array from arguments
	args.unshift("[selfLocation] ");
	console.warn.apply(console, args);
}

/**
 * Filtered and possibly smoothed out locations.
 *
 * Smoothing is done to avoid showing wrong location.
 * Not using locations with too high accuracy errors.
 * (?) Also doing simple average with previous location to even out bumps. Or maybe just use accuracy.
 *
 * Filtering is done to avoid adding points that don't add too much meaning
 * and might provide too much load on user's browser (and device).
 * So points too close of previous point are not added to the map. (speed close to 0?)
 * Also points that get too far from current postion will be removed. (or maybe filter by time? e.g. ~30min)
 */
SelfLocation.prototype._locations = [];

/**
 * Configuration of location filtering.
 *
 * Filters only apply to polyline.
 *
 * Accuracy experiments:
 * <li>PC at home on FF: 1638. Note! Speed was NaN!
 * <li>Phone at home on FF: 20-25 meters on first measurement. Sometimes above 100 m.
 *	Actual location was really somewhere in that range.
 */
SelfLocation.prototype.filterConfig = {
	accuracyMinimum: 100,	// [m]
	speedMinimum: 0.2,	// [m/s] 1 km/h ~= 0.2778 m/s
	ageMaximum: 60		// [minutes]
};

/**
 * Last (previous) location registered.
 * 
 * @type Position
 * https://developer.mozilla.org/en-US/docs/Web/API/Position
 * 
 * Most important:
 * <li>coords.latitude, coords.longitude -- [decimal degrees] actual position.
 * <li>coords.accuracy -- [meters] strictly positive double representing the accuracy, with a 95% confidence level, of the Coordinates.latitude and Coordinates.longitude properties expressed in meters
 * <li>coords.speed -- [m/s] the velocity of the device (can be null!).
 * <li>timestamp -- [ms] date and time of the creation of the Position.
 */
SelfLocation.prototype._lastLocation = null;

/**
 * Location watch ID.
 *
 * To stop watching location use:
 * navigator.geolocation.clearWatch(SelfLocation.prototype._watchId);
 */
SelfLocation.prototype._watchId = null;

/**
 * Layer for agent's location.
 *
 * @type L.LayerGroup
 */
SelfLocation.prototype._drawLayer = null;

/**
 * Setup layer for the agent's location.
 */
SelfLocation.prototype.setupDraw = function() {
	this._drawLayer = new L.LayerGroup();
	window.addLayerGroup('Agent (self) location', this._drawLayer, true);
};

/**
 * Location receiver.
 *
 * TODO:
 * <li> Add current postion to layer.
 * <li> If new postion is less accurate and speed is 0, then don't show it.
 * <li> Add locations to an array and render locations as a polyline.
 * <li> Filter locations based on `accuracyMinimum` and `speedMinimum`.
 * <li> Decrease `accuracyMinimum` if there are too many points.
 * <li> Increase `speedMinimum` if there are too many points.
 * <li> Remove old points based on `ageMaximum`.
 *
 * @param {Position} location
 */
SelfLocation.prototype.receiver = function(location) {
	this._locations.push(location);
	this.addCurrentLocation(location);

	console.log('[SelfLocation] '
		+ unixTimeToString(location.timestamp)
		+ `; accuracy [m]: ${location.coords.accuracy}`
		+ `; speed [m/s]: ${location.coords.speed}`
		+ `; location: ${location.coords.latitude}, ${location.coords.longitude}`
	);
};

/**
 * Dump locations (after testing).
 *
 * Dumping from console (e.g. FF WebIDE):
 * copy(plugin.selfLocation.dump());
 */
SelfLocation.prototype.dump = function() {
	// dump-able locations array
	var locations = this._locations.map(function(location){
		return {
				ll: {
					latitude: location.coords.latitude,
					longitude: location.coords.longitude
				},
				accuracy: location.coords.accuracy,
				speed: location.coords.speed,
				timestamp: location.timestamp
		};
	});

	return JSON.stringify(locations);
};


/**
 * Shows current location on the map.
 * @param {Position} location
 * @returns {Boolean} true If location was actually added.
 */
SelfLocation.prototype.addCurrentLocation = function(location) {
	var accuracy = location.coords.accuracy;
	// basic filter
	if (accuracy > this.filterConfig.accuracyMinimum) {
		//return false;
	}
	// remove previous
	if (this._prevMarker) {
		//this._drawLayer.removeLayer(this._prevMarker);
		this._prevMarker.setStyle({opacity:0.2});
	}
	// add new
	var ll = [location.coords.latitude, location.coords.longitude];
	var marker = L.circleMarker(ll,
		{
			// in meters
			radius: (accuracy > 50 ? 50 : (accuracy < 5 ? 5 : accuracy)),
			weight: 3,
			opacity: 1,
			color: 'red',
			fill: 'red',
			dashArray: null,
			clickable: false
		}
	);
	this._drawLayer.addLayer(marker);
	// remember added
	this._prevMarker = marker;
	return true;
};

/**
 * Setup location watch.
 */
SelfLocation.prototype.setupWatch = function() {
	var me = this;
	function success(location) {
		me.receiver(location);
	}
	function error(err) {
		LOGwarn('location error(' + err.code + '): ' + err.message);
	}
	// see: https://developer.mozilla.org/en-US/docs/Web/API/PositionOptions
	var options = {
		enableHighAccuracy: true,	// Ingress will probably enfoce it anyway
		//timeout: 5000,
		maximumAge: 0				// we want real position, no cache
	};
	this._watchId = navigator.geolocation.watchPosition(success, error, options);
};

//PLUGIN SETUP //////////////////////////////////////////////////////////

window.plugin.selfLocation = new SelfLocation();
var setup = function() {
	window.plugin.selfLocation.init();
};

//PLUGIN END //////////////////////////////////////////////////////////


setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);


