// ==UserScript==
// @id             iitc-plugin-self-location@eccenux
// @name           IITC plugin: Self location
// @category       Misc
// @version        0.1.1
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
SelfLocation.prototype.setupWatch = function() {
	this._drawLayer = new L.LayerGroup();
};

/**
 * Location receiver.
 *
 * @param {Position} location
 */
SelfLocation.prototype.receiver = function(location) {
	LOG({
		ll: {
			latitude: location.coords.latitude,
			longitude: location.coords.longitude
		},
		accuracy: location.coords.accuracy,
		speed: location.coords.speed,
		timestamp: location.timestamp,
	});
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


