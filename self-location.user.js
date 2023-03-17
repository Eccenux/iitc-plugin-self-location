// ==UserScript==
// @id             iitc-plugin-self-location@eccenux
// @name           IITC plugin: Self location
// @category       Misc
// @version        1.1.2
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @description    [1.1.2] Self location tracker. Your position on the map. Obviously works best on a mobile device.
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @match          https://*.ingress.com/mission/*
// @match          http://*.ingress.com/mission/*
// @match          https://intel.ingress.com/*
// @grant          none
// @updateURL      https://github.com/Eccenux/iitc-plugin-self-location/raw/master/self-location.meta.js
// @downloadURL    https://github.com/Eccenux/iitc-plugin-self-location/raw/master/self-location.user.js
// ==/UserScript==

/* global GM_info, $ */
/* global L,PLAYER,unixTimeToString */

/**
 * Main class of the plugin.
 *
 * Will become `window.plugin.selfLocation` singleton.
 */
function SelfLocation() {
}

/**
 * Initial initialization of the plugin.
 */
SelfLocation.prototype.init = function() {
	// seems like maybe Firefox/Android doesn't like when you setup watch on load
	//this.setupWatch();
	this.setupDraw();
	this.setupContent();
};

/**
 * Very simple logger.
 */
// eslint-disable-next-line no-unused-vars
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
 *
 * Note that locations are of type `Position`:
 * https://developer.mozilla.org/en-US/docs/Web/API/Position
 *
 * Most important properties:
 * <li>coords.latitude, coords.longitude -- [decimal degrees] actual position.
 * <li>coords.accuracy -- [meters] strictly positive double representing the accuracy, with a 95% confidence level, of the Coordinates.latitude and Coordinates.longitude properties expressed in meters
 * <li>coords.speed -- [m/s] the velocity of the device (can be null!).
 * <li>timestamp -- [ms] date and time of the creation of the Position.
 */
SelfLocation.prototype._locations = [];

/**
 * If true then `_locations` history will be kept intact (until page reload).
 * This should probably only be used for debugging.
 */
SelfLocation.prototype._keepAllLocationsHistory = true;

/**
 * Array of markers that form the player's trace.
 */
SelfLocation.prototype._traceMarkers = [];

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
SelfLocation.prototype.config = {
	filter : {
		accuracyMinimum: 30,// [m]
		speedMinimum: 0.2,	// [m/s] 1 km/h ~= 0.2778 m/s
		ageMaximum: 60,		// [minutes]
		lengthMaximum: 200	// max locations quee
	},
	goto : {
		longpress : 1000,	// [ms] how long is a long press (click/tap)
		minInterval : 20,	// [s] minimum time elapsed when following. Need to be long enough to allow the map to load.
		minDistance : 5,	// [%] minimum, relative distance (relative to shorter edge of the map)
		//                     should be in 0-50% range
		minZoom : 9,		// things might break around zoom level 7 (too much of the map visible)
		clickedTimeout : 3000,
		states : {
			normal: '⌖',
			clicked: '⊕',
			follow: '🎯'
		}
	}
};

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

// copy from main intel with link styles changed to button
SelfLocation.prototype.css = `
.leaflet-bar .btn {
	border: 0px solid white;
	padding: 0;
	margin: 0;
}

.leaflet-bar .btn,
.leaflet-bar .btn:hover {
 background-color: #fff;
 border-bottom: 1px solid #ccc;
 width: 26px;
 height: 26px;
 line-height: 26px;
 display: block;
 text-align: center;
 text-decoration: none;
 color: black;
}
.leaflet-bar .btn
{
 background-position: 50% 50%;
 background-repeat: no-repeat;
 display: block;
}
.leaflet-bar .btn:hover {
 background-color: #f4f4f4;
}
.leaflet-bar .btn:first-child {
 border-top-left-radius: 4px;
 border-top-right-radius: 4px;
}
.leaflet-bar .btn:last-child {
 border-bottom-left-radius: 4px;
 border-bottom-right-radius: 4px;
 border-bottom: none;
}
.leaflet-bar .btn.leaflet-disabled {
 cursor: default;
 background-color: #f4f4f4;
 color: #bbb;
}
.leaflet-touch .leaflet-bar .btn {
 width: 30px;
 height: 30px;
 line-height: 30px;
}
.leaflet-touch .leaflet-bar .btn:first-child {
 border-top-left-radius: 2px;
 border-top-right-radius: 2px;
}
.leaflet-touch .leaflet-bar .btn:last-child {
 border-bottom-left-radius: 2px;
 border-bottom-right-radius: 2px;
}
`;

/**
 * Setup always visible content.
 */
SelfLocation.prototype.setupContent = function() {
	// leaflet (sidebar buttons)
	$('.leaflet-control-container .leaflet-top.leaflet-left').append(`
		<style>
		${this.css}
		</style>
		<div class="leaflet-control-selfLocation leaflet-bar leaflet-control">
			<button id="selfLocation-goto-button" class="btn" data-state="normal" 
				>${this.config.goto.states.normal}</button>
		</div>
	`);

	var $gotoButton = $('#selfLocation-goto-button');
	this.preapreGotoEvents($gotoButton);
};

/**
 * Prepare go-to location button.
 * @param {jQuery} $gotoButton
 */
SelfLocation.prototype.preapreGotoEvents = function($gotoButton) {
	var me = this;
	var states = this.config.goto.states;

	var firstTimeInfo = true;
	function clickInfo() {
		if (firstTimeInfo) {
			me.toastMessage('Centered map. Long press the button to follow your position.', 15);
			firstTimeInfo = false;
		}
	}

	// standard click
	var clickedTimerId = null;
	var clickedTimeout = this.config.goto.clickedTimeout;
	$gotoButton.click(function(event) {
		event.preventDefault();

		// stop following location
		if ($gotoButton.attr('data-state') === 'follow') {
			$gotoButton.text(states.normal);
			$gotoButton.attr('data-state', 'normal');
			me.followEnd();
			return;
		}

		// clicked feedback
		$gotoButton.text(states.clicked);
		// revert to normal
		if (clickedTimerId) {
			clearTimeout(clickedTimerId);
		}
		clickedTimerId = setTimeout(function(){
			if ($gotoButton.attr('data-state') === 'normal') {
				$gotoButton.text(states.normal);
			}
		}, clickedTimeout);

		// restart watch and center map
		if (me._watchId == null) {
			LOGwarn('Restart attempt...; following: ', me._followLocation);
			// less verbose when not following
			if (me._followLocation) {
				me.toastMessage('Position lost. Restarting...', 10);
			}
			// note, callback is called each time after starting watch
			var afterClick = true;
			me.setupWatch(true, function(){
				// center when following (or 1st time after click)
				if (me._followLocation) {
					me.toastMessage('Position lost. Restarted.', 1);
					me.centerMap();
				} else if (afterClick) {
					me.centerMap();
					clickInfo();
				}
				afterClick = false;
			});
		} else {
			me.centerMap();
			clickInfo();
		}
	});

	// longpress
	var longpress = this.config.goto.longpress;
	var start = 0;
	$gotoButton.on('touchstart', function() {
		start = new Date().getTime();
	});
	$gotoButton.on('touchmove', function() {
		finalize();
	});
	$gotoButton.on('touchend', function() {
		finalize();
	});
	function finalize() {
		var deltaT = new Date().getTime() - start;
		if (deltaT >= longpress) {
			// start following location
			if ($gotoButton.attr('data-state') !== 'follow') {
				$gotoButton.text(states.follow);
				$gotoButton.attr('data-state', 'follow');
				me.followStart();
				me.toastMessage('Following location.', 3);
			}
		}
	}
	
	this.$gotoButton = $gotoButton;
};

/** Toast message on the right of $element. */
SelfLocation.prototype.toastMessage = function(shortMessage, fade, $el) {
	if (!$el) {
		$el = $('#selfLocation-goto-button');
	}
	const id = 'SelfLocation-toast';
	const margin = 20;	// px
	const destructionTime = (typeof fade === 'number' ? fade : 10);	// seconds
	
	const pos = $el.offset();
	pos.left += $el.width() + margin;

	$(`#${id}`).remove();
	$('body').append(`
		<div
			id="${id}"
			class="ui-tooltip ui-corner-all ui-widget-shadow ui-widget ui-widget-content"
			style="top: ${pos.top}px; left: ${pos.left}px;"
		>
		<div class="ui-tooltip-content">
			${shortMessage}
		</div>
		</div>
	`);

	// self destruct
	if (this.destructionId) {
		clearTimeout(this.destructionId);
	}
	this.destructionId = setTimeout(function () {
		$(`#${id}`).fadeOut("slow", function() {});
	}, destructionTime * 1000);
};

/**
 * If true then after reading next location the map will be centered.
 */
SelfLocation.prototype._centerOnNextLocation = false;

/**
 * Center map on current (next) location.
 * @param {Position|undefined} location If not provided then will attempt to read from history.
 */
SelfLocation.prototype.centerMap = function(location) {
	//LOG('centerMap: ', location);
	if (!location) {
		if (this._locations.length) {
			location = this._locations[this._locations.length-1];
			//LOG('location from history: ', location);
		}
	}
	if (location) {
		var ll = [location.coords.latitude, location.coords.longitude];
		window.map.setView(ll, window.map.getZoom());
	} else {
		//LOG('center on next location');
		this._centerOnNextLocation = true;
	}
};

/**
 * If true then constantly follow user location.
 */
SelfLocation.prototype._followLocation = false;

/**
 * Last time the map was centered.
 */
SelfLocation.prototype._followPreviousTime = 0;

/**
 * Start following user location.
 */
SelfLocation.prototype.followStart = function() {
	this._followLocation = true;
};

/**
 * Stop following user location.
 */
SelfLocation.prototype.followEnd = function() {
	this._followLocation = false;
};

/**
 * Start following user location.
 * @param {Position} location
 */
SelfLocation.prototype.follow = function(location) {
	if (!this._followLocation) {
		return;
	}
	// too large map visible
	if (window.map.getZoom() < this.config.goto.minZoom) {
		return;
	}
	// do same filtering as for trace (at least for now)
	//LOG('follow: ', location);
	if (this.shouldAddAsTrace(location)) {
		var now = new Date().getTime();
		var deltaT = (now - this._followPreviousTime) / 1000;
		//console.log(`deltaT: ${deltaT}`);
		if (deltaT > this.config.goto.minInterval) {
			// reset time even if distance don't qualify to avoid constant re-calc of distance
			this._followPreviousTime = now;

			var distance = _getRelativeDistance(_getDistanceFromCenter(location));
			//console.log(`distance: ${distance}`);
			if (distance > this.config.goto.minDistance) {
				//console.log('will center');
				this.centerMap(location);
			}
		}
	}
};

var _zoomToMapSize = {};

/**
 * Get aproximate map size for current zoom.
 *
 * Note! This returns smallest dimmesion from width and height.
 */
var _getMapSize = function() {
	var zoom = window.map.getZoom();
	// return from cache
	if (zoom in _zoomToMapSize) {
		return _zoomToMapSize[zoom];
	}
	// calculate
	var bounds = window.map.getBounds();
	var ne = bounds.getNorthEast();
	var sw = bounds.getSouthWest();
	var w = GeoCalc.distanceAproximation(
		ne.lat, ne.lng,
		ne.lat, sw.lng
	);
	var h = GeoCalc.distanceAproximation(
		ne.lat, ne.lng,
		sw.lat, ne.lng
	);
	var size = Math.min(w, h);
	// cache
	_zoomToMapSize[zoom] = size;
	// finalize
	return size;
};

var _getRelativeDistance = function(distance) {
	var size = _getMapSize();
	return 100 * distance / size;
};

/**
 * Calculate distance from the center of the map.
 * @param {Object} location Current location.
 * @returns {Number} Distance in meters from center.
 */
var _getDistanceFromCenter = function(location) {
	var center = window.map.getCenter();
	// location to simple object
	var distance = GeoCalc.distanceAproximation(
		location.coords.latitude, location.coords.longitude,
		center.lat, center.lng
	);
	return distance;
};

/**
 * Geo calculation library (part of it actually).
 *
 * @author Chris Veness 2002-2012
 * @author Maciej Nux Jaros 2013-2014
 *
 * Licensed under (at ones choosing)
 *   <li>MIT License: http://www.opensource.org/licenses/mit-license
 *   <li>or CC-BY: http://creativecommons.org/licenses/by/3.0/
 */
function GeoCalc() {
}

/**
 * Converts degrees to radians.
 * @param {Number} degrees
 * @returns {Number}
 */
GeoCalc.toRad = function(degrees) {
	return degrees * Math.PI / 180;
};

/**
 * Converts radians to degrees.
 * @param {Number} radians
 * @returns {Number}
 */
GeoCalc.toDeg = function(radians) {
	return radians * 180 / Math.PI;
};

/**
 * Aproximate distance between to points.
 *
 * Note! This is rough estimation designed for speed. See:
 * https://www.movable-type.co.uk/scripts/latlong.html#equirectangular
 *
 * @param {Number} lat1 Float in degrees (same for other params).
 * @param {Number} lon1
 * @param {Number} lat2
 * @param {Number} lon2
 * @returns {Number} Distance in meters.
 */
GeoCalc.distanceAproximation = function(lat1, lon1, lat2, lon2) {
	var R = 6371000;  // radius of the Earth in m

	lat1 = GeoCalc.toRad(lat1);
	lat2 = GeoCalc.toRad(lat2);
	lon1 = GeoCalc.toRad(lon1);
	lon2 = GeoCalc.toRad(lon2);

	var x = (lon2 - lon1) * Math.cos(0.5 * (lat2+lat1));
	var y = lat2 - lat1;
	var d = R * Math.sqrt(x*x + y*y);
	return d;
};

/**
 * Setup current location for the distance plugin.
 * @param {Position} location
 */
SelfLocation.prototype.setupLocationForDistance = function(location) {
	var distancePlugin = window.plugin.distanceToPortal;
	// noplugin bail out
	if (typeof distancePlugin !== 'function') {
		//console.log('setupLocationForDistance: noplugin');
		return;
	}
	// check if already set to anything
	var alreadySet = false;
	if (typeof distancePlugin.currentLoc === 'object' && distancePlugin.currentLoc !== null) {
		//console.log('setupLocationForDistance: already set');
		alreadySet = true;
	}
	// if not accurate enough or don't change much then don't bother
	if (alreadySet && !this.shouldAddAsTrace(location)) {
		//console.log(`setupLocationForDistance: don't change`);
		return;
	}
	// should make sens to change the location now
	//console.log(`setupLocationForDistance: changing`);
	distancePlugin.currentLoc = L.latLng({
		"lat":location.coords.latitude,
		"lng":location.coords.longitude
	});
};

/**
 * Location receiver.
 *
 * @param {Position} location
 */
SelfLocation.prototype.receiver = function(location) {
	if (this._centerOnNextLocation) {
		this.centerMap(location);
		this._centerOnNextLocation = false;
	}
	if (this._keepAllLocationsHistory) {
		this._locations.push(location);
	}
	this.updateTrace(location);
	this.addCurrentLocation(location);
	this.follow(location);
	this.setupLocationForDistance(location);
};

/**
 * Show location in debug console.
 * @param {Position} location
 */
SelfLocation.prototype.logLocation = function(location) {
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
	var locations = this._locations.map(function (location) {
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
 * Should location be left as a trace.
 * 
 * @param {Position} location
 * @returns {Boolean} true If location should not be filtered out.
 */
SelfLocation.prototype.shouldAddAsTrace = function(location) {
	if (location.coords.accuracy > this.config.filter.accuracyMinimum) {
		return false;
	}
	if (location.coords.speed < this.config.filter.speedMinimum) {
		return false;
	}
	return true;
};

/**
 * Shows current location on the map.
 * @param {Position} location
 */
SelfLocation.prototype.addCurrentLocation = function(location) {
	// remove previous
	if (this._prevMarker) {
		this._drawLayer.removeLayer(this._prevMarker);
		this._prevMarker = null;
	}
	// add current position marker
	var marker = this.createMarker(location, true);
	this._drawLayer.addLayer(marker);
	// remember added
	this._prevMarker = marker;
};

/**
 * Adds location to future trace and updates trace.
 *
 * Note that this only adds previous location so that only one marker is added for current location.
 *
 * @param {Position} location
 */
SelfLocation.prototype.updateTrace = function(location) {
	// add previous location to trace
	if (this._prevLocationToTrace) {
		// add trace marker
		var marker = this.createMarker(this._prevLocationToTrace, false);
		this._drawLayer.addLayer(marker);
		this._prevLocationToTrace = null;
		// remember added
		this._traceMarkers.push(marker);
	}
	// remove old if required
	if (this._traceMarkers.length > this.config.filter.lengthMaximum) {
		var oldMarker = this._traceMarkers.shift();
		this._drawLayer.removeLayer(oldMarker);
	}
	// add as trace later
	if (this.shouldAddAsTrace(location)) {
		this._prevLocationToTrace = location;
	}
};

/**
 * Create position marker.
 * 
 * @param {Position} location
 * @param {Boolean} isCurrent Is the location a current location (determines marker style).
 * @returns {L.CircleMarker}
 */
SelfLocation.prototype.createMarker = function(location, isCurrent) {
	var accuracy = location.coords.accuracy;
	var ll = [location.coords.latitude, location.coords.longitude];
	var radius, fillColor;
	// current
	if (isCurrent) {
		radius = (accuracy > 50 ? 50 : (accuracy < 5 ? 5 : accuracy)); // in meters
		fillColor = (PLAYER.team === 'ENLIGHTENED') ? 'green' : 'blue';
	// trace
	} else {
		radius = 5;
		fillColor = 'red';
	}
	return L.circleMarker(ll,
		{
			radius: radius,	// in pixels
			weight: 5,
			opacity: isCurrent ? 1 : 0.2,
			color: isCurrent ? 'gold' : 'red',
			fill: true,
			fillColor: fillColor,
			fillOpacity: isCurrent ? 0.2 : 0.1,
			dashArray: null,
			clickable: false
		}
	);
};

/**
 * Setup location watch.
 * 
 * @param {Boolean?} userAction If true then re-setup after user action.
 * @param {Function?} callback Success callback.
 */
SelfLocation.prototype.setupWatch = function(userAction, callback) {
	var me = this;
	function success(location) {
		me.receiver(location);
		const accuracy = location.coords.accuracy;
		if (accuracy > 200) {
			LOGwarn(`Note! Very low accuracy in coordinates: ${accuracy}. Will stop watching locations.`);
			// brake watch (might be a temporary bug in FF)
			navigator.geolocation.clearWatch(me._watchId);
			me._watchId = null;
		}
		else if (accuracy > 20) {
			LOG('Low accuracy in coordinates: '+ accuracy);
		}
		if (typeof callback == 'function') {
			callback(location.coords);
		}
		userAction = false;
	}
	function error(err) {
		LOGwarn('location error(' + err.code + '): ' + err.message);
		// brake watch
		navigator.geolocation.clearWatch(me._watchId);
		me._watchId = null;
		if (userAction) {
			// probably Fox fo Android
			var info;
			if (navigator.userAgent.search(/mobile.+firefox/i)) {
				info = 'Please make sure location is enabled for the intel page (check lock icon in Firefox). Also check your app permissions.';
			} else {
				info = 'Please make sure location is enabled for the application and in your system.';
			}
			alert(`Unable to get location (code: ${err.code}). \n\n${info}`);
		}
		userAction = false;
	}
	// see: https://developer.mozilla.org/en-US/docs/Web/API/PositionOptions
	var options = {
		enableHighAccuracy: true,	// Ingress will probably enfoce it anyway
		//timeout: 5000,
		maximumAge: 0				// we want real position, no cache
	};
	this._watchId = navigator.geolocation.watchPosition(success, error, options);
};


// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};
window.plugin.selfLocation = new SelfLocation();

//PLUGIN SETUP //////////////////////////////////////////////////////////
function wrapper(plugin_info) {
	var setup = function() {
		window.plugin.selfLocation.init();
	};

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


