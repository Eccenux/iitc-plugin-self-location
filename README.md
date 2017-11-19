# IITC plugin: Self location

Self location tracker. Obviously works best on a mobile device.

Basically this plugin shows your position on the map. It can also show your tracks on the map when you move. This should allow you to see where you are heading even if your compass doesn't work well (or doesn't work at all).

See also: [my other IITC plugins](https://github.com/search?q=user%3AEccenux+iitc-plugin&type=Repositories).

Installation
------------

Assuming you already have IITC just &rarr; **[install the script](https://github.com/Eccenux/iitc-plugin-self-location/raw/master/self-location.user.js)**.

Usage
------------

Your location is tracked every time you switch to IITC. It might be paused when you switch to other apps.
To stop tracking just disable this plugin in Tampermonkey (or in IITC app if you use that).

Note that your location is on a separate layer. So you can temporarily hide your location if it obstructs your view.

Privacy
-------

Your location is only for you to see. They are not sent anywhere by this plugin.

Also note that when you refresh the page the locations are gone, wiped out. They are only stored in temporary memory of your device.

If you do want to permanently store your location then I would suggest Endomondo or something ;-).
