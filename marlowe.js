
// Marlowe
// =======

// The detective.

var utils = require('./utils');
var path = require('path'); 
var moment = require('moment');
var cheerio = require('cheerio');
var Nightmare = require('nightmare');
require('nightmare-load-filter')(Nightmare);



// Genres are priorities in this order
var GENRE_PRIORITIES = ['documentary', 'family', 'musical', 'animation', 'music', 'horror', 'sci-fi', 'action', 'drama', 'romance', 'thriller', 'comedy', 'fantasy', 'film-noir', 'adventure']; // lowercase, http://www.imdb.com/genre/ 
var KIDS_RATINGS_G = ['g','tv-y','tv-g']; // lowercase
//var KIDS_RATINGS_PG = ['pg','tv-y7'];

/*
Options
-------
https://docs.omniref.com/js/npm/nightmare/1.7.0	
timeout: how long to wait for page loads, default 5000ms.
interval: how frequently to poll for page load state, default 50ms.
port: port to mount the phantomjs instance to, default 12301.
weak: set dnode weak option to false to fix cpp compilation for windows users, default true.
loadImages: load all inlined images, default true.
ignoreSslErrors: ignores SSL errors like expired or self-signed certificates, default true.
sslProtocol: set the protocol for secure connections [sslv3|sslv2|tlsv1|any], default any.
webSecurity: enables web security and forbids cross-domain XHR, default true.
proxy: specify the proxy server to use address:port, default not set.
proxyType: specify the proxy server type [http|socks5|none], default not set.
proxyAuth: specify the auth information for the proxy user:pass, default not set.
cookiesFile: specify the file to store the persistent cookies, default not set.
phantomPath: specify a different custom path to PhantomJS, default not set.
*/
	
function Marlowe(){

};

Marlowe.SHOW_NIGHTMARE = false; // Show electron browser
Marlowe.SCRAPE_LOAD_WAIT = 3*500; // Wait a little bit after page loads

Marlowe.applyDebugMode = function(){
	Marlowe.SHOW_NIGHTMARE = true;
	Marlowe.SCRAPE_LOAD_WAIT = 1500;
}


Marlowe.getAllData = function(filename, cb){
	
	Marlowe.getIMDBData(filename, function(err, imdbData){
		
		if (err){
			return cb(err);
		}
				
		var updateErr = Marlowe.updateDataBasedOnFilenameAttributes(imdbData, filename);
		if (updateErr){
			return cb(updateErr);
		}
		
		Marlowe.appendIMDBTrailerVideoFileURLToData(imdbData, function(err, appendedData){
						
			if (err){
				utils.throwError(err); // Output error then continue
			} else {
				imdbData = appendedData;
			}
			
			Marlowe.getRottenTomatoesRating(imdbData, function(err, data){
			
				if (err){
					utils.throwError(err);
					return cb(null, imdbData); // Return data if RT rating not found
				}
			
				imdbData.rottenTomatoesRating = data.rating;
				imdbData.rottenTomatoesURL = data.url;
			
				return cb(null, imdbData);
			
			});
			
		});
		
	});

}

// Guessing
// --------

// Given a file name guess title, year, category etc.
Marlowe.guessByFilename = function(filename){

	// Guess
	// -----
	
	var guess = {};
	guess.title = path.basename(filename, path.extname(filename));

	// guess.year = 1900
	// guess.cat = 'movie' | 'tv'
	// guess.tv = {season:0, episode:0}
	
	// Find year
	// ---------
	
	var re = /([1|2]{1}[9|0]{1}[0-9]{2})/i; 
	var m;
 
	if ((m = re.exec(guess.title)) !== null) {
			if (m.index === re.lastIndex) {
					re.lastIndex++;
			}
			guess.year = Number(m[0]);
			guess.title = guess.title.substr(0, m.index);
			guess.cat = 'movie';
			
	}
	
	// Season and episode
	// ------------------
	
	if (guess.year === undefined){
	
		var re = /s([0-9]+)e([0-9]+)/i; 
		var m;
		if ((m = re.exec(guess.title)) !== null) {
				if (m.index === re.lastIndex) {
						re.lastIndex++;
				}
				guess.title = guess.title.substr(0, m.index);
				guess.cat = 'tv';
				guess.tv = {};
				guess.tv.season = Number(m[1]);
				guess.tv.episode = Number(m[2]);
		}
	} 
	
	// Space words
	// -----------
	
	guess.title = guess.title.replace(/(\.| |-|\||~|\[|\]|\(|\))+/ig, ' ');
	guess.title = utils.trim(guess.title);
	
	// ID
	// --
	
	var slugParts = [];
	if (utils.isSet(guess.title)){
		slugParts.push(guess.title); 
	}
	if (utils.isSet(guess.cat)){
		slugParts.push(guess.cat); 
		if (guess.cat == 'movie'){
			if (utils.isSet(guess.year)){
				slugParts.push(guess.year); 
			}
		}
	}
	
	guess.id = slugParts.join('|').split(' ').join('-').toLowerCase();
	
	return guess;

}

Marlowe.guessIDforFilename = function(filename){
	
	var guess = Marlowe.guessByFilename(filename);
	return guess.id;
	
}

Marlowe.updateDataBasedOnFilenameAttributes = function(data, filename){
	
	var guess = Marlowe.guessByFilename(filename);
	
	data.filename = filename;
	
	var guessIsTV = utils.isSet(guess.cat) && guess.cat == 'tv';
	var dataIsTV = utils.isSet(data.cat) && data.cat == 'tv';
	
	if (guessIsTV &&  dataIsTV){
	
		var guessHasSeasonAndEpisode = utils.isSet(guess.tv) && utils.isSet(guess.tv.season) && utils.isSet(guess.tv.episode)
		
		if (guessHasSeasonAndEpisode){
		
			if (utils.isSet(data.id)){
				var dataID = data.id.split('_')[0]; // Assuming imdb id has no hyphen
				data.id = dataID + '_S' + utils.pad(2, guess.tv.season, '0') + 'E' + utils.pad(2, guess.tv.episode, '0') 
			} else {
				return new Error('Data is invalid: no `id` property');
			}
			
			if (!utils.isSet(data.tv)){
				data.tv = {};
			}
			data.tv.season = guess.tv.season;
			data.tv.episode = guess.tv.episode;
		
		} else {
			return new Error('TV show season/episode not present in filename');
		}
	
	} else if (guessIsTV || dataIsTV){
		
		return new Error('Filename guess is incompatible with data');
		
	}
	
	return null;
	
}

// IMDB
// ----

// Given guess data build a term to target imdb page for this media
Marlowe.googleIMDBTermForGuess = function(guess){
	
	var term = guess.title + ' ';
	
	if (guess.cat !== undefined){
		
		if (guess.cat == 'tv'){
			
			var options = ['tv series','tv show','television series'];
			term += options[Math.floor(Math.random()*options.length)] + ' ';
			
		} else {
		
			var options = ['movie', 'film'];
			term += options[Math.floor(Math.random()*options.length)] + ' ';
		}
	}
	
	if (guess.year !== undefined){
		term += guess.year + ' ';
	}
	
	var options = ['site:imdb.com', 'imdb', 'imdb internet movie database', 'imdb.com'];
	term += options[Math.floor(Math.random()*options.length)];
	
	return term;

}

Marlowe.getIMDBData = function(filename, cb){

	Marlowe.getIMDBPageURL(filename, function(err, IMDBpageURL){
			
		if (err){
			return cb(err);
		}
		
		Marlowe.scrapeIMDB(IMDBpageURL, function(err, data){
		
			if (err){
				return cb(err);
			}
			
			var matchResult = Marlowe.doesDataMatchFilename(filename, data);
			if (matchResult !== true){
				return cb(matchResult);
			}
			
			return cb(null, data);
			
		});
	});
	
}

// Ignore these words when comparing titles
Marlowe.COMMON_WORDS = ['the','and','that','have','with','you','into','when','from','there'];

Marlowe.doesDataMatchFilename = function(filename, data){

	var guess = Marlowe.guessByFilename(filename);
	
	if (!utils.isSet(guess.title) || !utils.isSet(data.title)){
		return new Error('Data doesn\'t match filename. Title not found.');
	}
	
	var titleWordsGuess = Marlowe.makeWordList(guess.title);
	var titleWordsData = Marlowe.makeWordList(data.title);
	
	var matchTotal = Math.min(titleWordsData.length, titleWordsData.length);
	
	if (matchTotal == 0){
		return new Error('Data doesn\'t match filename. Couldn\'t find any unique words in title.');
	}
	var matchCount = 0;
	for (var i = 0; i < titleWordsGuess.length; i++){
		if (titleWordsData.indexOf(titleWordsGuess[i]) > -1){
			matchCount++;
		}
	}
	
	// Could set a % threshold in the future 
	//var matchPerc = matchCount/matchTotal;
	//var matchPercReadable = Math.round(matchPerc*100);
	
	if (matchCount == 0){ // 1 word should match at least
		return new Error('Data doesn\'t match filename. No matching title words found. {titleWordsGuess:`'+titleWordsGuess.join(',')+'`,titleWordsData:`'+titleWordsData.join(',')+'`}');
	}
	
	return true;

}

Marlowe.makeWordList = function(str){
	
	str = str.toLowerCase()
	str = str.replace(/[^a-z ]/gmi, '');
	var listTmp = str.split(' ');
	var list = [];
	for (var i = 0; i < listTmp.length; i++){
		if (listTmp[i].length < 3){
			// Ignore words under 3 chars
		} else if (Marlowe.COMMON_WORDS.indexOf(listTmp[i]) > -1){
			// Ignore common words
		} else {
			list.push(listTmp[i]);
		}
	}
	
	return list;
	
}

Marlowe.scrapeIMDB = function(IMDBpageURL, cb){

	// Scrape URL
		
	var nightmare = Nightmare({show: Marlowe.SHOW_NIGHTMARE}) ;//, waitTimeout: 3000, dock: true})

	nightmare
		.filter({
			urls: '*://*/*', //['*://*/*.css','*://*/*.js','*://*/*.jpg','*://*/*.png','*://*/*.gif'], // ,'*.','*.','*.','*.gif'
		}, function(details, cb) {
			// console.log('filter ' + details.url);
			return cb({ cancel: details.url.charAt(details.url.length-1) != '/' });
		})
		.goto(IMDBpageURL)
		//.wait('input[type="submit"]')
		//.type('input[type="text"]', term)
		//.click('input[type="submit"]')
		.wait(Marlowe.SCRAPE_LOAD_WAIT)
		.evaluate(function() {
			return document.documentElement.innerHTML;
		})
		.end()
		.then(function (result) {
		
			try {
		
				var $ = cheerio.load(result);
			
				var data = {};
			
				data.id = Marlowe.idFromIMDBPageURL(IMDBpageURL);
				data.url = IMDBpageURL;
			
				var pageTitle = $('title').text();
			
				// cat
				if (pageTitle.toLowerCase().split('tv series').length > 1){
					data.cat = 'tv';
				} else {
					data.cat = 'movie';
				}
			
			
				// title
				var regex = /([^(]*) \(/gi;
				var m;
				while ((m = regex.exec(pageTitle)) !== null) {
					// This is necessary to avoid infinite loops with zero-width matches
					if (m.index === regex.lastIndex) {
						regex.lastIndex++;
					}
					if (m.length > 1){
						data.title = m[1];
					}
				}
			
				// rating
				data.rating = $('meta[itemprop="contentRating"]').attr('content');
			
				// duration
				// ISO8601 string. http://momentjs.com/docs/
				var isoDur = $('time[itemprop="duration"]').attr('datetime');
				if (utils.isSet(isoDur)){
					data.duration = moment.duration(isoDur).asMinutes();
				}
			
			
				// genre
				$('.itemprop[itemprop="genre"]').each(function(i, element){
					if (typeof data.genres === 'undefined'){
						data.genres = [];
					}
					data.genres.push($(this).text());
				});
			
			
				// year
				if (data.cat == 'tv'){
				
					var regex = /\(.*?([0-9]{4})[^0-9]([0-9]{4})\)/gi;
					
					if (regex.test(pageTitle)){ // year range
						
						regex.lastIndex = 0;
						var m;						
						while ((m = regex.exec(pageTitle)) !== null) {
								
								if (m.index === regex.lastIndex) {
										regex.lastIndex++;
								}
								
								//console.log(m);
								
								if (m.length >= 2){ // Start year
									data.year = Number(m[1]); 									
								}
								if (m.length >= 3){ // End year
								
									if (!utils.isSet(data.tv)){
										data.tv = {};
									}
									data.tv.endYear = Number(m[2]);
									
								}
						}
						
					} else { // start year only
						
						var regex = /\(.*?([0-9]{4})/gi;
						var m;
						while ((m = regex.exec(pageTitle)) !== null) {
								
								if (m.index === regex.lastIndex) {
										regex.lastIndex++;
								}
								if (m.length > 1){
									data.year = Number(m[1]);
								}
						}
					}
					
				} else {
					data.year = Number($('#titleYear a').text());
				}
			
				// budget
				$('#titleDetails .txt-block').each(function(i, element){
					if ($(this).find('h4').text() == 'Budget:'){
						var regex = /(\$([0-9,]*))/gim;
						var m;
						while ((m = regex.exec($(this).text())) !== null) {
							// This is necessary to avoid infinite loops with zero-width matches
							if (m.index === regex.lastIndex) {
								regex.lastIndex++;
							}
							if (m.length > 1){
								data.budget = Number(m[1].split('$').join('').split(',').join(''));
							}
						}
					}
				});
			
				// country
				$('#titleDetails .txt-block').each(function(i, element){
					if ($(this).find('h4').text() == 'Country:'){
						$(this).find('a').each(function(i, element){
							if (typeof data.country === 'undefined'){
								data.country = [];
							}
							data.country.push($(this).text());
						});
					}
				});
				
				// language
				$('#titleDetails .txt-block').each(function(i, element){
					if ($(this).find('h4').text() == 'Language:'){
						$(this).find('a').each(function(i, element){
							if (typeof data.language === 'undefined'){
								data.language = [];
							}
							data.language.push($(this).text());
						});
					}
				});
				
				// trailer
				
				if ($('.slate a').length){
					var trailerURL = $('.slate a').first().attr('href');
					if (trailerURL.charAt(0) == '/'){
						trailerURL = utils.rootURL(IMDBpageURL) + trailerURL;
					} else {
						trailerURL = IMDBpageURL + trailerURL;
					}
					
					var regex = /\/video\/imdb\/(vi[^\/?]*)[?|\/]{0,1}/i; // Assuming trailer video id starts with `vi`
				
					var m;
					if ((m = regex.exec(trailerURL)) !== null) {
							// The result can be accessed through the `m`-variable.
							m.forEach((match, groupIndex) => {
									if (m.length > 1){
										data.trailerID = m[1];
									}
							});
					}
					
				}
			
				if (Marlowe.isIMDBDataValid(data)){
				
					setTimeout(function(){
						cb(null, data);
					}, 5);
					return;				
					
				} else {
					
					setTimeout(function(){
						cb(new Error('Failed to scrape IMDB'));
					}, 5);
					return;
				
				}
			
			} catch(err) {
				
				setTimeout(function(){
					cb(new Error('Imdb scrape threw exception: `'+String(err.message)+'`'))
				}, 5);
				return;
				
			}
			
		}).catch(function() {
			cb(new Error('Promise rejection'))
		});
	
}

Marlowe.isIMDBDataValid = function(data){

	if (!utils.isSet(data.id)){
		console.log('invalid id');
		return false;
	}
	if (!utils.isSet(data.cat)){
		console.log('invalid cat');
		return false;
	}
	if (!data.genres || data.genres.length < 1){
		console.log('invalid genres');
		return false;
	}
	if (!utils.isSet(data.title)){
		console.log('invalid title');
		return false;
	}
	if (!utils.isSet(data.year)){
		console.log('invalid year' + data.year);
		return false;
	}
	//if (!utils.isSet(data.rating)){
	//	console.log('invalid rating');
	//	return false;
	//}
	if (!utils.isSet(data.duration) || isNaN(data.duration)){
		console.log('invalid duration');
		return false;
	}
	//if (!utils.isSet(data.budget) || isNaN(data.budget)){
	//	return false;
	//}
	return true;
	
}


Marlowe.getIMDBPageURL = function(filename, cb){

	var guess = Marlowe.guessByFilename(filename);
	var term = Marlowe.googleIMDBTermForGuess(guess);
	
	Marlowe.searchGoogle(term, 1, function(err, results){
		
		if (!err){
		
			for (var i = 0; i < Math.min(1, results.length); i++){ // Check 1st result
				
				if (Marlowe.isIMDBPageURL(results[i].url)){
						return cb(null, results[i].url);
				}
			}	
		}
		
		return cb(new Error('Cannot find IMDB page for `'+filename+'`'));
		
	});

}

Marlowe.isIMDBPageURL = function(url){

	var regex = /^https{0,1}:\/\/www\.imdb\.com\/title\/(tt[0-9]*)\/{0,1}$/gi;
	return regex.test(url)
	
}


Marlowe.idFromIMDBPageURL = function(url){

	var regex = /^https{0,1}:\/\/www\.imdb\.com\/title\/(tt[0-9]*)\/{0,1}$/gi;
	var m;
	while ((m = regex.exec(url)) !== null) { 
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}
		if (m.length > 1){
			return m[1];
		}
	}
	
	return null;
	
}


// IMDB trailer
// ------------

Marlowe.appendIMDBTrailerVideoFileURLToData = function(data, cb){  

	if (!utils.isSet(data.trailerID)){
		// Not found
		return cb(new Error('IMDB `data.trailerID` not set, not chasing file URL.')); 
	}
	
	Marlowe.getIMDBVideoFileURLFromID(data.trailerID, function(err, videoURL){

		if (err) {
			return console.error(err);
		}
	
		data.trailerURL = videoURL;
	
		return cb(null, data);

	});

}

Marlowe.getIMDBVideoFileURLFromID = function(videoID, cb){ // Video id is IMDB's own reference for the video

	var nightmare = Nightmare({ show: Marlowe.SHOW_NIGHTMARE}) ;//, waitTimeout: 3000, dock: true})

	nightmare
		//.filter({
		//	urls: '*://*/*', //['*://*/*.css','*://*/*.js','*://*/*.jpg','*://*/*.png','*://*/*.gif'], // ,'*.','*.','*.','*.gif'
		//}, function(details, cb) {
		//	// console.log('filter ' + details.url);
		//	return cb({ cancel: details.url.charAt(details.url.length-1) != '/' });
		//})
		.goto('http://www.imdb.com/video/imdb/'+videoID+'/imdb/single?vPage=1') // Load single video (iframe contents)
		.wait(Marlowe.SCRAPE_LOAD_WAIT)
		.evaluate(function() {
			return document.documentElement.innerHTML;
		})
		.end()
		.then(function (result) {
		
			try {
		
				var $ = cheerio.load(result);
				
				var videoURL;
				
				if ($('script.imdb-player-data').length){ // Get video URL from raw js in page script
					var trailerJS = $('script.imdb-player-data').first().html();
					if (utils.isSet(trailerJS)){
						var re = /[^L]"[\s]*?,[\s]*?"videoUrl"[\s]*?:[\s]*?"{1}([^"]*)"/i; 
						var m;
			
						if ((m = re.exec(trailerJS)) !== null) {
							if (m.index === re.lastIndex) {
								re.lastIndex++;
							}
							if (m.length > 1){
								videoURL = utils.trim(m[1]);
							}
						}
					}
					
				}
				
				if (utils.isSet(videoURL)){
					setTimeout(function(){
						cb(null, videoURL);
					}, 5);
					return;
				} else {
					setTimeout(function(){
						cb(new Error('Unable to find IMDB video URL for videoID `'+videoID+'`'));
					}, 5);
					return;
				}
				
    	} catch(err) {
				
				setTimeout(function(){
					cb(new Error('Search for IMDB video URL threw exception: `'+String(err.message)+'`'))
				}, 5);
				return;
				
			}
    	
		}).catch(function() {
			cb(new Error('Promise rejection'))
		});

}


// Rotten tomatoes
// ---------------

Marlowe.googleRTRatingTermForData = function(data){ // A valid data obj

	var term = data.title + ' ';
	
	if (data.cat !== undefined){
		
		if (data.cat == 'tv'){
			
			var options = ['tv series','tv show','television series'];
			term += options[Math.floor(Math.random()*options.length)] + ' ';
			
		} else {
		
			if (data.year !== undefined){
				term += data.year + ' ';
			}
			
			var options = ['movie', 'film'];
			term += options[Math.floor(Math.random()*options.length)] + ' ';
			
		}
	}
	
	var options = ['site:rottentomatoes.com', 'rottentomatoes.com', 'rotten tomatoes rottentomatoes.com'];
	term += options[Math.floor(Math.random()*options.length)];
	
	return term;
}

Marlowe.isURLForRottenTomatoesPage = function(url, cat){
	
	var regex;
	
	if (cat == 'tv'){
		regex = /^https:\/\/www\.rottentomatoes\.com\/tv\/[^\/]*\/{0,1}$/gi;
	} else if (cat == 'movie'){
		regex = /^https:\/\/www\.rottentomatoes\.com\/m\/[^\/]*\/{0,1}$/gi;
	} else {
		return false;
	}
	return regex.test(url);

}

Marlowe.getRottenTomatoesRating = function(data, cb){

	Marlowe.getRottenTomatoesPage(data, function(err, url){
		
		if (err){
			return cb(err);	
		}
		
		Marlowe.scrapeRottenTomatoesRatingFromPage(url, function(err, rating){

			if (err){
				return cb(err);	
			}
			
			return cb(null, {url:url, rating:rating});

		});		
	});
}

Marlowe.getRottenTomatoesPage = function(data, cb){

	var term = Marlowe.googleRTRatingTermForData(data);
	
	Marlowe.searchGoogle(term, 3, function(err, results){
		
		if (!err){
			
			for (var i = 0; i < Math.min(3, results.length); i++){ // Check 1st 3
				
				if (Marlowe.isURLForRottenTomatoesPage(results[i].url, data.cat)){
						
						return cb(null, results[i].url);
				
				}
			}	
		}
		
		return cb(new Error('Cannot find Rotten Tomatoes page for `'+data.title+'`'));
		
	});
}

Marlowe.scrapeRottenTomatoesRatingFromPage = function(url, cb){
	
	var nightmare = Nightmare({ show: Marlowe.SHOW_NIGHTMARE}) ;//, waitTimeout: 3000, dock: true})

	nightmare
		.filter({
			urls: ['*://*/*.css','*://*/*.js','*://*/*.jpg','*://*/*.png','*://*/*.gif'], // ,'*.','*.','*.','*.gif'
		}, function(details, cb) {
			// console.log('filter ' + details.url);
			// return cb({ cancel: details.url.charAt(details.url.length-1) != '/' });
			return cb({ cancel: true });
		})
		.goto(url)
		.wait(Marlowe.SCRAPE_LOAD_WAIT)
		.evaluate(function() {
			return document.documentElement.innerHTML;
		})
		.end()
		.then(function (result) {
			
			try {
		
				var $ = cheerio.load(result);
				
				// tv
			
				var rating;
			
				rating = $('.meter-value span[itemprop="ratingValue"]').length ? $('.meter-value span[itemprop="ratingValue"]').first().text() : null;
			
				if (utils.isSet(rating)){
					rating = Number(rating);
					if (!isNaN(rating) && rating >=0 && rating <= 100){
						return cb(null, rating);
					}
				}
			
				// movie
			
				rating = $('.meter-value span').length ? $('.meter-value span').first().text() : null;
				
				if (utils.isSet(rating)){ 
				
					rating = Number(rating);
					if (!isNaN(rating) && rating >=0 && rating <= 100){
						
						setTimeout(function(){
							cb(null, rating)
						}, 5);
						return;
						
					}
				}
				
				setTimeout(function(){
					cb(new Error('Unable to scrape Rotten Tomatoes rating from `'+url+'`'))
				}, 5);
				return;
				
			} catch(err) {
				
				setTimeout(function(){
					cb(new Error('Scrape Rotten Tomatoes threw exception: `'+String(err.message)+'`'))
				}, 5);
				return;
				
			}
    	
		}).catch(function() {
			cb(new Error('Promise rejection'))
		});
		
}

// Scraping
// --------

Marlowe.searchGoogle = function(term, maxResultCount, cb){
	
	var search = {};
	search.q = term;
	
	if (typeof maxResultCount !== 'undefined' && !isNaN(Number(maxResultCount)) && Number(maxResultCount) > 0){
		search.num = maxResultCount;
	}
	
	var searchQ = '';
	for (var p in search){
		if (searchQ.length > 0){
			searchQ += '&';
		}
		searchQ += p + '=' + search[p];
	}
	
	var nightmare = Nightmare({ show: Marlowe.SHOW_NIGHTMARE}) ;//, waitTimeout: 3000, dock: true})

	nightmare
		.filter({
			urls: ['*://*/*.css','*://*/*.jpg','*://*/*.png','*://*/*.gif'], 
		}, function(details, cb) {
			// console.log('filter ' + details.url);
			return cb({ cancel: true });
		})
		.goto('https://www.google.com.au/search?' + searchQ)
		//.goto('https://www.google.com/#q=' + encodeURIComponent(term))
		//.wait('input[type="submit"]')
		//.type('input[type="text"]', term)
		//.click('input[type="submit"]')
		//.useragent("Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36")
		.wait(Marlowe.SCRAPE_LOAD_WAIT)
		.evaluate(function() {
			return document.documentElement.innerHTML;
		})
		.end()
		.then(function (result) {
		
			try {
		
				var $ = cheerio.load(result);
				var results = [];
				$('h3.r a').each(function(i, element){
					results.push({title:$(this).text(), url:$(this).attr('href')});
				});
    	
    		setTimeout(function(){
					cb(null, results);
				}, 5);
				return;
    	
    	} catch(err) {
				
				setTimeout(function(){
					cb(new Error('Search Google threw exception: `'+String(err.message)+'`'))
				}, 5);
				return;
				
			}
    	
		}).catch(function() {
			cb(new Error('Promise rejection'))
		});
		
}

// File naming
// -----------

Marlowe.proposeFilename = function(data){ // Assuming valid data obj
	
	if (!utils.isSet(data.title)){
		return false;
	}
	
	if (!utils.isSet(data.cat)){
		return false;
	}
	
	if (!utils.isSet(data.filename)){
		return false;
	}
	
	var fnParts = [];
	fnParts.push(data.title);

	if (data.cat == 'tv'){
	
		if (utils.isSet(data.tv.season) && utils.isSet(data.tv.episode)){
	
			fnParts.push('S' + utils.pad(2, data.tv.season, '0') + 'E' + utils.pad(2, data.tv.episode, '0') );
		
		} else {
			
			return false;
			
		}
		
		//var yr = '('+data.year;
		//if (utils.isSet(data.endYear)){
		//	yr+='-'+data.endYear;
		//}
		//fnParts.push(yr+')');
		
	} else if (data.cat == 'movie'){
		
		fnParts.push('('+data.year+')');
		
	} else {
		
		return false;
		
	}
	
	if (utils.isSet(data.rating)){	
		if (data.rating.toLowerCase().split(' ').join('') != 'norating' && data.rating.toLowerCase().split(' ').join('') != 'notrated'){
			fnParts.push(String(data.rating));
		}
	}
	
	if (utils.isSet(data.duration)){
	
		fnParts.push(String(data.duration)+'mins');
	
	}
	
	if (data.cat == 'movie' && utils.isSet(data.budget)){
		
		var b = data.budget;
		b = Math.round((b/1000000)*10)/10;
		fnParts.push('$' + String(b)+'M');
		
	}
	
	if (utils.isSet(data.language) && Array.isArray(data.language) && data.language.length > 0){
		var englishLang = false;
		for (var i = 0; i < data.language.length; i++){
			if (data.language[i].toLowerCase() == 'english'){
				englishLang = true;
				break;
			}
		}
		if (!englishLang){
			fnParts.push('(foreign)')
		}
	}
	
	fnParts.push('['+data.id+']');
	
	if (utils.isSet(data.rottenTomatoesRating)){
		fnParts.push('RT'+String(data.rottenTomatoesRating)+'%');
	}
	
	var filename = fnParts.join(' ')+path.extname(data.filename);
	filename = utils.sanitizeFilenameForFileSystem(filename, '-', false);
	
	return filename;
				
}



Marlowe.proposeDirPath = function(data){ // Assuming valid data obj
	
	var dirpath = [];
	
	if (!utils.isSet(data.cat)){
		return false;
	}
	
	// Kids
	
	var isForKids = false;
	
	//for (var i = 0; i < data.genres.length; i++){
	//	if (data.genres[i].toLowerCase() == 'family'){ // Too broad: disabled
	//		isForKids = true;
	//		break;
	//	};	
	//}
	
	if (!isForKids && utils.isSet(data.rating)){	
		for (var i = 0; i < KIDS_RATINGS_G.length; i++){
			if (KIDS_RATINGS_G[i] == data.rating.toLowerCase()){
				isForKids = true;
				break;
			}
		}
	}
	
	if (isForKids){
		dirpath.push('kids');
	}
	
	// Vintage
	
	//if (!isForKids && ((data.cat == 'movie' && utils.isSet(data.year) && data.year < 2000) || (data.cat == 'tv' && utils.isSet(data.tv.endYear) && data.tv.endYear < 2000))){
	//	dirpath.push('vintage (pre 2000)');
	//}
	
	// Cat
	
	dirpath.push(data.cat == 'movie' ? 'movies' : data.cat);
	
	if (isForKids){
		return Marlowe.sanitiseDirPathArr(dirpath);
	}
	
	// Custom genres
	
	if (data.cat == 'movie'){
	
		if (utils.isSet(data.year) && data.year < 2000){
			dirpath.push('1 vintage (pre 2000)');
		} else if (utils.isSet(data.rottenTomatoesRating) && data.rottenTomatoesRating >= 85){
			dirpath.push('2 critic\'s choice (RT85% or higher)');
		} else if (utils.isSet(data.budget) && data.budget >= 100000000){
			dirpath.push('3 big budget ($100M+)');
		} else if (utils.isSet(data.rottenTomatoesRating) && data.rottenTomatoesRating <= 25){
			dirpath.push('4 stinkers (RT25% or lower)');
		} else {
			dirpath.push('5 remainders');
		} 
		
	} else if (data.cat == 'tv'){
	
		if (utils.isSet(data.endYear) && data.endYear < 2000){
			dirpath.push('1 vintage (pre 2000)');
		} else if (utils.isSet(data.rottenTomatoesRating) && data.rottenTomatoesRating >= 85){
			dirpath.push('2 critic\'s choice (RT85% or higher)');
		} else if (utils.isSet(data.rottenTomatoesRating) && data.rottenTomatoesRating <= 25){
			dirpath.push('3 stinkers (RT25% or lower)');
		} else {
			dirpath.push('4 remainders');
		} 
		
	}
	
	// Genre
		
	var genreFound = false;
	for (var i = 0; i < GENRE_PRIORITIES.length; i++){
		for (var j = 0; j < data.genres.length; j++){
			if (data.genres[j].toLowerCase() == GENRE_PRIORITIES[i]){
				dirpath.push(data.genres[j].toLowerCase());
				genreFound = true;
				break;
			}
		}
		if (genreFound){
			break;
		}
	}
	
	if (!genreFound){
		for (var i = 0; i < Math.min(1,data.genres.length); i++){
			dirpath.push(data.genres[i].toLowerCase());
			genreFound = true;
			break;
		}
	}
	
	if (!genreFound){
		dirpath.push('unknown');
	}
	
	// Idea: genre combos
	
	return Marlowe.sanitiseDirPathArr(dirpath);
	
}

// Trailer naming
// --------------

Marlowe.proposeTrailerFilenameBaseFromMediaFilepath = function(filepath){
	
	var mediaFileBase = path.basename(filepath)
	var mediaFileCore = Marlowe.coreMediaFileIdentity(mediaFileBase, true); // Eg `The Movie (1232)` or `The TV Show`
	
	if (mediaFileCore !== false){
		return mediaFileCore + ' trailer';
	}	
	
	return false;

}

Marlowe.isMediaFilepathATrailer = function(filepath){

	var base = path.basename(filepath);
	return base.split(' trailer.').length == 2;
	
}

Marlowe.isMediaFilepathAssociatedWithTrailerFilepath = function(mediaFilepath, trailerFilepath){

	return Marlowe.proposeTrailerFilenameBaseFromMediaFilepath(mediaFilepath) == path.basename(trailerFilepath, path.extname(trailerFilepath));

}

// Eg `The Movie (1232)` or `The TV Show S01E05`
Marlowe.coreMediaFileIdentity = function(filepath, omitSeasonEpisode){ 
	
	omitSeasonEpisode = typeof omitSeasonEpisode !== 'undefined' ? omitSeasonEpisode : false;
	
	var regex;
	
	if (omitSeasonEpisode){
		regex = /(^[^[]*?) S[0-9]{2}E[0-9]{2}.*$|^(.*? \([0-9]{4}\))[^()]*$/i;
	} else {
		regex = /(^[^[]*? S[0-9]{2}E[0-9]{2}).*$|^(.*? \([0-9]{4}\))[^()]*$/i; 
	}
	
	var m;
	if ((m = regex.exec(path.basename(filepath))) !== null) {
			// The result can be accessed through the `m`-variable.
			
			if (m.length >= 3){
				if (utils.isSet(m[1])){
					return m[1]; // tv
				}
				if (utils.isSet(m[2])){
					return m[2]; // movie
				}
			}
			
	}
	
	return false;
	
}

// Cleaning up
// -----------

Marlowe.sanitiseDirPathArr = function(dirpath){
	for (var i = 0; i < dirpath.length; i++){
		dirpath[i] = utils.sanitizeFilenameForFileSystem(dirpath[i], '-', true);
	}
	return dirpath;
}

module.exports = Marlowe;