# Handlebars-Async

Make clientside Handlebars async!

an in browser implementation of 
https://github.com/LoicMahieu/handlebars-async

## Install

copy lib/handlebars.js to your server.

include it in your project after the main Handlebars file.

## Usage
```js
handlebarsAsync(Handlebars);
Handlebars.registerHelper('async', function(arg1) {
  var done = this.async();

  setTimeout(function() {
    done(null, arg1.toUpperCase())
    done();
  }, 1000);
});

var tpl = Handlebars.compile('{{asyncHelper "value"}}');

tpl(function (err, result) {
  // result == "VALUE"
});
```
