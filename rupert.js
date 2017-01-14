
// Rupert
// ======

// The librarian.

var utils = require('./utils');
var path = require('path'); 
var fs = require('fs'); 
var moment = require('moment');
var Marlowe = require('./marlowe');
var download = require('download');
var url = require('url');
var ProgressBar = require('progress');
var Spinner = require('cli-spinner').Spinner;

// Notes
// -----
// - Folder blind - media and srt only, everything else will be ignored and removed
// - Subtitle (.srt) files must have identical name to media file to be recognised
// - Files beginning with `.` are deleted

function Rupert(){
	
	console.log('RUPERT');
	console.log('======');
	
	this.setStatus(Rupert.STATUS_PAUSED);
	
};

Rupert.MEDIA_EXTS = ['mkv','avi','mp4','wmv','m4v','mpg', 'mov'];
Rupert.SUBTITLE_EXTS = ['srt'];
Rupert.SAVE_DATA_TO_JSON_FILE = false; // Accompanying data file will be saved next to output media file. For debugging.

// Status
Rupert.STATUS_PAUSED = 'paused';
Rupert.STATUS_CRAWLING = 'crawling';
Rupert.STATUS_ERROR = 'error'

// Dir names
Rupert.DIRNAME_FAIL_DUPES = 'dupes';
Rupert.DIRNAME_FAIL_OTHER = 'other';

// Rupert.OVERWRITE_EXISTING_TRAILERS = false;

Rupert.MAX_ATTEMPTS = 3; 

// Crawling
// --------

Rupert.prototype.goCrawl = function($inDir, $outDir, $failDir, $blacklistIPs){
	
	this.inDir = path.resolve($inDir);
	this.outDir = path.resolve($outDir);
	this.failDir = path.resolve($failDir);
	this.failOtherDir = path.join(this.failDir, Rupert.DIRNAME_FAIL_OTHER);
	this.failDupesDir = path.join(this.failDir, Rupert.DIRNAME_FAIL_DUPES);
	this.attemptCount = 0;
	
	
	this.blacklistIPs = typeof $blacklistIPs !== 'undefined' ? $blacklistIPs : [];
	
	if (!fs.existsSync(this.inDir)){
		return throwError('IN dir not found `'+this.inDir+'`');
	}
	
	if (utils.isPathWithinPath(this.outDir, this.inDir)){
		return throwError('OUT dir cannot be inside IN dir');
	}
	
	if (utils.isPathWithinPath(this.inDir, this.outDir)){
		return throwError('IN dir cannot be inside OUT dir');
	}
	
	if (utils.isPathWithinPath(this.failDir, this.inDir)){
		return throwError('FAIL dir cannot be inside IN dir');
	}
	
	if (!fs.existsSync(this.outDir) && !utils.mkdirSyncRecursive(this.outDir)) {
		return throwError('Failed to create OUT dir `'+this.outDir+'`');
	}
	
	if (!fs.existsSync(this.failDir) && !utils.mkdirSyncRecursive(this.failDir)) {
		return throwError('Failed to create FAIL dir `'+this.failDir+'`');
	}
	
	if (!fs.existsSync(this.failOtherDir) && !utils.mkdirSyncRecursive(this.failOtherDir)) {
		return throwError('Failed to create FAIL OTHER dir `'+this.failOtherDir+'`');
	}
	
	if (!fs.existsSync(this.failDupesDir) && !utils.mkdirSyncRecursive(this.failDupesDir)) {
		return throwError('Failed to create FAIL dir `'+this.failDupesDir+'`');
	}
	
	// Out can't be within in

	this.cache = {};
	this.trailerCache = {};
	
	console.log('In:\n' + this.inDir);
	console.log('Out:\n' + this.outDir);
	console.log('Fail:\n' + this.failDir);
	console.log('Blacklist IPs:\n' + this.blacklistIPs.join(','));
	
	this.setStatus(Rupert.STATUS_CRAWLING);
	
	this.crawlNext();
	
}

Rupert.applyDebugMode = function(){
	
	Rupert.SAVE_DATA_TO_JSON_FILE = true;
	Marlowe.applyDebugMode();
	
}

Rupert.prototype.crawlNext = function(longWait){

	longWait = typeof longWait !== 'undefined' ? longWait : false;
	
	var self = this;
	var fn = this.crawlNextAfterWait;
	
	setTimeout(function(){
	
		fn.apply(self, []);
		
	}, longWait ? 2*60*1000 : Math.random()*2000 + 1000);
	
}

Rupert.prototype.crawlNextAfterWait = function(){
	
	
	
	Rupert.checkIP(this.blacklistIPs, this.crawlNextAfterIPOK, this.onIPError, this)
	
}

Rupert.prototype.onIPError = function(){
	
	this.crawlNext();
	
}

Rupert.prototype.crawlNextAfterIPOK = function(){

	if (!fs.existsSync(this.inDir)){
		return throwError('IN dir not found `'+this.inDir+'`');
	}
	
	if (!fs.existsSync(this.outDir)){
		return throwError('OUT dir not found `'+this.outDir+'`');
	}
	
	if (!fs.existsSync(this.failDir)){
		return throwError('FAIL dir not found `'+this.failDir+'`');
	}
	
	if (!fs.existsSync(this.failOtherDir)){
		return throwError('FAIL OTHER dir not found `'+this.failOtherDir+'`');
	}
	
	if (!fs.existsSync(this.failDupesDir)){
		return throwError('FAIL DUPES dir not found `'+this.failDupesDir+'`');
	}
	
	var complete = Rupert.cleanPathRecursive(this.inDir, true, Rupert.MEDIA_EXTS, Rupert.SUBTITLE_EXTS.concat('json'), this.failOtherDir);
	
	
	if (complete){
			
		console.log('Complete');	
		
		this.crawlNext(true); // Keep checking, but wait longer between checks
		return;
		
	} else {
	
		var srcFilePath = Rupert.findNextMediaFileRecursive(this.inDir, true);
		// Alternate reverse listing, so if it fails on one file it won't hit the same search straight away
		
		if (srcFilePath === false || !fs.existsSync(srcFilePath)){
			throw new Error('Next media file not found');
		}
		
		console.log('Media file is `' + path.basename(srcFilePath) + '`...');
		
		
		// Look in temporary cache
		var cacheID = Marlowe.guessIDforFilename(srcFilePath);
		var cachedData = this.cache[cacheID];
		if (utils.isSet(cachedData)){
			var updateErr = Marlowe.updateDataBasedOnFilenameAttributes(cachedData, srcFilePath);
			if (updateErr){
				cachedData = undefined;
			}
		}
			
		if (utils.isSet(cachedData)){ // Cache is just local var kept for this session only
		
			console.log('Loading from cache...');
			this.onData.apply(this, [null, cachedData, srcFilePath]); 
			
		} else {
			
			var spinner = new Spinner('Researching %s');	
			spinner.start();
			
			var self = this;
			Marlowe.getAllData(path.basename(srcFilePath), function(err, data){
				
				spinner.stop(true);
				console.log('');
				self.onData.apply(self, [err, data, srcFilePath]); 
				
			});
		
		}
	}
	
}

Rupert.prototype.onData = function(err, data, srcFilePath){

	this.attemptCount++;
	var mediaDestPath;
	if (!err){
	
		var destFilename = Marlowe.proposeFilename(data);
		var destDirPathList = Marlowe.proposeDirPath(data);
		
		if (destFilename !== false && destDirPathList !== false){
			
			console.log('Success:');
			console.log(data);
			
			// Save to temporary cache
			var cacheID = Marlowe.guessIDforFilename(srcFilePath);
			if (typeof this.cache[cacheID] === 'undefined'){
				this.cache[cacheID] = data;
			} else {
				console.log('Loaded from cache');
			}
		
			var moveSrcToDest;
			
			var destDirFsPathParts = [this.outDir];
			destDirFsPathParts = destDirFsPathParts.concat(destDirPathList);
			var destDirFsPath = path.join.apply(this, destDirFsPathParts);
			
			utils.mkdirSyncRecursive(destDirFsPath, this.outDir); // Make containing dir
			
			var destFsPath = path.join(destDirFsPath, destFilename);
			
			// Find duplicate - could be any media extension
			
			moveSrcToDest = true;
			
			var dupeFsPath;
			var baseDest = path.basename(destFilename, path.extname(destFilename));
			for (var i = 0; i < Rupert.MEDIA_EXTS.length; i++){
				var ext = Rupert.MEDIA_EXTS[i];
				ext = ext.charAt(0) != '.' ? '.' + ext : ext;
				var dupeDestMediaFilePath = path.join(destDirFsPath, baseDest + ext);
				if (fs.existsSync(dupeDestMediaFilePath) && !fs.lstatSync(dupeDestMediaFilePath).isDirectory()){
					
					dupeFsPath = dupeDestMediaFilePath;
					
					var sizeSrc = Rupert.fileSizeInBytes(srcFilePath);
					var sizeExisting = Rupert.fileSizeInBytes(dupeFsPath);
				
					if (sizeExisting > sizeSrc){
				
						// Keep existing if bigger, move src to dupes instead
						
						var destDupe = utils.uniquePath(path.join(this.failDupesDir, destFilename));
						
						console.log('Moving `'+path.basename(srcFilePath)+'`');
						console.log('-> `'+destDupe.split(this.outDir).join('')+'`');
					
						Rupert.moveMediaFile(srcFilePath, destDupe, data);
					
						moveSrcToDest = false;
					
					} else {
					
						// Move existing from in to dupes, continue with src copy
				
						Rupert.moveMediaFile(dupeFsPath, utils.uniquePath(path.join(this.failDupesDir, path.basename(dupeFsPath))));
						moveSrcToDest = true;
						
					}
					
					break;
				
				}
			}			
			
			if (moveSrcToDest){
			
				// Move from in to out
				
				console.log('Moving `'+path.basename(srcFilePath)+'`');
				console.log('-> `'+destFsPath.split(this.outDir).join('')+'`');
		
				Rupert.moveMediaFile(srcFilePath, destFsPath, data);
				mediaDestPath = destFsPath;
				
			}
			
		} else {
			
			err = new Error('Unable to resolve destination file path for media file');
			
		}
		
	}
	
	if (err){
	
		console.log('Error:');
		console.log(err.message);
	
		if (this.attemptCount >= Rupert.MAX_ATTEMPTS){
		
			console.log('Giving up on this file');
		
			// Move to fail dir on multiple attempts
		
			if (!utils.isSet(data)){
				data = {};
			} 
			data.error = err.message;
	
			Rupert.moveMediaFile(srcFilePath, utils.uniquePath(path.join(this.failDir, path.basename(srcFilePath))), data);
	
		} else {
	
			console.log('Attempting again...');
	
		}
	
	} else {
		
		this.attemptCount = 0; // Success so reset attempt count
		
	}
	
	if (err || !utils.isSet(mediaDestPath)){
		this.crawlNext();
	} else {
	
		// Get trailer then `crawlNext`
		this.downloadTrailer(data, mediaDestPath, function(err, trailerFilepath){
			
			if (err){
				console.log('Trailer error:');
				console.log(err.message);
			} else {
				console.log('Saved trailer:');
				console.log(trailerFilepath);
			}
			
			this.crawlNext();
			
			
		})
	}
}

Rupert.prototype.downloadTrailer = function(data, mediaDestPath, cb){
	
	// Get trailer
	if (!utils.isSet(data.trailerURL)){
		return cb.apply(this, [new Error('No `trailerURL` prop present.')]);
	}
	
	console.log('Saving trailer...');
	
	var trailerBase = Marlowe.proposeTrailerFilenameBaseFromMediaFilepath(mediaDestPath);
	
	if (utils.isSet(this.trailerCache[trailerBase]) && this.trailerCache[trailerBase]){
		return cb.apply(this, [new Error('Already downloaded trailer this session')]);
	}
	
	if (trailerBase !== false){
	
			var parsed = url.parse(data.trailerURL);
			var ext = path.extname(parsed.pathname);
			
			if (!utils.isExtofExtensions(ext, Rupert.MEDIA_EXTS)){
				return cb.apply(this, [new Error('Remote `trailerURL` needs to be a media file')]);
			}
			
			var trailerFilename = trailerBase + ext;
			
			console.log('Trailer name will be `' +trailerFilename+'`...');
			
			var trailerFilepath = path.join(path.dirname(mediaDestPath), trailerFilename);
			
			//if (fs.existsSync(trailerFilepath)){
			//	if (fs.lstatSync(trailerFilepath).isDirectory()){
			//		return cb.apply(this, [new Error('Trailer exists and is a dir')]);
			//	}
			//	fs.unlinkSync(trailerFilepath); // Remove existing trailer
			//}
			
			// Delete ALL trailers at destination	if they exist
			for (var i = 0; i < Rupert.MEDIA_EXTS.length; i++){
				var ext = Rupert.MEDIA_EXTS[i];
				ext = ext.charAt(0) != '.' ? '.' + ext : ext;
				var trailerFilePathDest = path.join(path.dirname(mediaDestPath), trailerBase + ext);
				if (fs.existsSync(trailerFilePathDest) && !fs.lstatSync(trailerFilePathDest).isDirectory()){
					fs.unlinkSync(trailerFilePathDest);
				}
			}
			
			
			var bar = new ProgressBar('[:bar] :percent :etas', {
				complete: '=',
				incomplete: ' ',
				width: 20,
				total: 0
			});

			
			var self = this;
			try {
    	
				download(data.trailerURL)
				.on('response', res => {
					bar.total = res.headers['content-length'];
					res.on('data', data => bar.tick(data.length));
				
				})
				.then(data => {
					
					fs.writeFileSync(trailerFilepath, data);
					self.trailerCache[trailerBase] = true;
					cb.apply(self, [null, trailerFilepath]);
				});
			
			} catch(err) {
				
				cb.apply(self, [err]);
				
			}
			
			
	} else {

		return cb.apply(this, [new Error('Unable to build trailer dest name for `'+mediaDestPath+'`. ')]);
	
	}
}



// - Destination must not exist before calling this method.
// - Any subtitle files preexisting at destination will be deleted
// - Any subtitle files in source will be brought along
// - If |data| set then a JSON file will be written at destination (if settings allow)
Rupert.moveMediaFile = function(srcPath, destPath, data){
	
	if (fs.existsSync(destPath)){
		throw new Error('Cannot move as destination already exists');
	}
	
	if(fs.lstatSync(srcPath).isDirectory()) {
		throw new Error('Source is a dir');
	}
	
	var baseNameSrc = path.basename(srcPath, path.extname(srcPath));
	var baseNameDest = path.basename(destPath, path.extname(destPath));
	
	// Delete all existing subtitles from destinations
	
	for (var i = 0; i < Rupert.SUBTITLE_EXTS.length; i++){
		var ext = Rupert.SUBTITLE_EXTS[i];
		ext = ext.charAt(0) != '.' ? '.' + ext : ext;
		var supFilePathDest = path.join(path.dirname(destPath), baseNameDest + ext);
		if (fs.existsSync(supFilePathDest) && !fs.lstatSync(supFilePathDest).isDirectory()){
			fs.unlinkSync(supFilePathDest); // Remove existing
		}
	}
	
	// Leave trailers at destination: 
	// Trailers will be re-downloaded per session and all existing will be removed
	
	// Move
	fs.renameSync(srcPath, destPath);
	
	// Bring along any subtitles from source to destination
	for (var i = 0; i < Rupert.SUBTITLE_EXTS.length; i++){
		var ext = Rupert.SUBTITLE_EXTS[i];
		ext = ext.charAt(0) != '.' ? '.' + ext : ext;
		var supFilePathSrc = path.join(path.dirname(srcPath), baseNameSrc + ext);
		if (fs.existsSync(supFilePathSrc) && !fs.lstatSync(supFilePathSrc).isDirectory()){
			var supFilePathDest = path.join(path.dirname(destPath), baseNameDest + ext);
			if (fs.existsSync(supFilePathDest)){
				throw new Error('Subtitle file exists in destination');
			}
			fs.renameSync(supFilePathSrc, supFilePathDest);
		}
	}
	
	// Don't bring trailers
	// Trailers will be re-downloaded per session, if a trailer is left behind
	// it will be cleaned
	
	// Write data json: for debugging
	
	if (Rupert.SAVE_DATA_TO_JSON_FILE && typeof data !== 'undefined' && data != null){
		var dataFilePath = path.join(path.dirname(destPath), baseNameDest + '.json');
		fs.writeFileSync(dataFilePath, JSON.stringify(data, null, '\t'));
	}
	
}

// Core
// ----

Rupert.prototype.setStatus = function($status){
	this.status = $status;
	console.log('Status: ' + this.status);
}

Rupert.prototype.throwError = function(msg){
	
	this.setStatus(Rupert.STATUS_ERROR);
	throw new Error(msg);

}

// File System
// -----------

Rupert.fileSizeInBytes = function(fsPath){
	
	if (fs.existsSync(fsPath)){
		var stats = fs.statSync(fsPath);
		return stats.size;
	}
	
	return 0;
 
}

// Removes empty directories - deletes `.` prefixed files too.
// Returns if empty (returns if parent can be deleted)
// The |validSupplementaryExtList| are extensions that are allowed only if there is a valid ext file with the exact same base file name

Rupert.cleanPathRecursive = function(fsPath, retainTopLevel, validExtList, validSupplementaryExtList, invalidExtMovePath, _level){
	
	if (!utils.isSet(fsPath)){
		throw new Error('Path not defined');
	}
	
	validExtList = typeof validExtList !== 'undefined' ? validExtList : '*';
	validSupplementaryExtList = typeof validSupplementaryExtList !== 'undefined' ? validSupplementaryExtList : '*';
	
	if (typeof invalidExtMovePath === 'undefined'){
		throw new Error('|invalidExtMovePath| not defined');
	}
	
	retainTopLevel = typeof retainTopLevel !== 'undefined' ? retainTopLevel : false;
	
	_level = typeof _level !== 'undefined' ? _level : 0;
	reverseFileListing = typeof reverseFileListing !== 'undefined' ? reverseFileListing : false;
	
	fsPath = path.resolve(fsPath);
	if (fsPath.split(path.sep).length < 4){
		throw new Error('Invalid path: too shallow');
	}
	
	invalidExtMovePath = path.resolve(invalidExtMovePath);
	if (invalidExtMovePath.split(path.sep).length < 4){
		throw new Error('Invalid `invalidExtMovePath`: too shallow');
	}
	
  if(fs.existsSync(fsPath)) {
  	
  	if(fs.lstatSync(fsPath).isDirectory()) {
  		
  		var totFiles = 0;
			fs.readdirSync(fsPath).forEach(function(file,index){
				
				if (!Rupert.cleanPathRecursive(fsPath + path.sep + file, false, validExtList, validSupplementaryExtList, invalidExtMovePath, _level+1)){
					totFiles++;
				}
				
			});
			
			if (totFiles == 0 && (!retainTopLevel || _level > 0)){
				fs.rmdirSync(fsPath);
				return true;
			}
			
			if (totFiles == 0 && _level == 0){
				return true; // Return if top level empty
			}
			
			return false;
			
    } else {
    	
     	if (path.basename(fsPath).charAt(0) == '.'){
     		
     		// Delete `.` prefix file
     		fs.unlinkSync(fsPath);
     		return true;
     		
     	} else if (!utils.isFileOfExtension(fsPath, validExtList)){
     		
     		// Is it a subtitle etc?
     		if (utils.isFileOfExtension(fsPath, validSupplementaryExtList)){
     			
     			var baseName = path.basename(fsPath, path.extname(fsPath));
     			// Keep if there is valid of same base in same directory
     			for (var i = 0; i < validExtList.length; i++){
     				var validExt = validExtList[i];
     				validExt = validExt.charAt(0) != '.' ? '.' + validExt : validExt;
     				var validFilePath = path.join(path.dirname(fsPath), baseName + validExt);
     				if (fs.existsSync(validFilePath)){
     					return false; // Keep supplementary file
     				}
     			}
     		}
     		
     		if (utils.isSet(invalidExtMovePath)){
     			
     			// Move to invalid dir
     			var destFsPath = path.join(invalidExtMovePath, path.basename(fsPath));
     			fs.renameSync(fsPath, utils.uniquePath(destFsPath));
     			
     			return true;
     		} else {
     			return false; // Keep
     		}
     		
     	} else {
     		
     		// Is trailer?    		
     		if (Marlowe.isMediaFilepathATrailer(fsPath)){
     			// Only leave if it has an existing media file associated
     		
     			// Look for this trailer's media file
     			var parentDir = path.dirname(fsPath);
     			var files = utils.getFiles(parentDir);
     			for (var j = 0; j < files.length; j++){
     				var mediaFilepath = path.join(parentDir,files[j])
     				if (utils.isFileOfExtension(mediaFilepath, Rupert.MEDIA_EXTS) && Marlowe.isMediaFilepathAssociatedWithTrailerFilepath(mediaFilepath, fsPath)){
     					return false; // Keep trail as it has associated media file
     				}
     			}
     			
     			// Move trailer to invalid dir
     			var destFsPath = path.join(invalidExtMovePath, path.basename(fsPath));
     			fs.renameSync(fsPath, utils.uniquePath(destFsPath));
     			return true;
     		
     		}
     		
	     	// Marlowe.isMediaFilepathATrailer = function(filepath){
				// Marlowe.isMediaFilepathAssociatedWithTrailerFilepath = function(mediaFilepath, trailerFilepath){
	
     		return false; // Keep
     	}
    } 
  }
}


// Traverse folders looking for a file belonging to |validExtList|
Rupert.findNextMediaFileRecursive = function(fsPath, randomiseFileListing){
	
	if (!utils.isSet(fsPath)){
		throw new Error('Path not defined');
	}
	
	if(fs.existsSync(fsPath)) {
		
		if(fs.lstatSync(fsPath).isDirectory()) {
			
			var files = fs.readdirSync(fsPath);
			//if (reverseFileListing){
			//	files.reverse();
			//}
			if (randomiseFileListing){
			console.log('rand')
				files = utils.shuffleArray(files);
			
			}
			
			
			
			
			for (var i in files) {
				var file = files[i];
				var result = Rupert.findNextMediaFileRecursive(path.join(fsPath, file), randomiseFileListing);
				if (result !== false){
					return result;
				}
			}
			
		} else if (utils.isFileOfExtension(fsPath, Rupert.MEDIA_EXTS)){
			
			if (Marlowe.isMediaFilepathATrailer(fsPath)){ // If not a trailer then return media file
				return false;
			} else {
				return fsPath;
			}
			
		}
	}
	
	return false;

}
	
// IP checking
// -----------

Rupert.checkIP = function(blacklistIPs, cbSuccess, cbFail, cbScope){
	
	
	if (Array.isArray(blacklistIPs) && blacklistIPs.length > 0){
		
		var spinner = new Spinner('Checking IP %s');	
		spinner.start();
	
		var getIP = require('external-ip')();
		getIP(function(err, ip){
		
			spinner.stop(true);
			console.log('');
		
    	if (err) {
        // every service in the list has failed 
        
        console.log('IP unknown');
        cbFail.apply(cbScope, []);
        
        return;
    	}
    	
    	for (var i = 0; i < blacklistIPs.length; i++){
    		if (blacklistIPs[i] == ip){
    			//throwError('Black listed IP ('+ip+') detected.');
    			
    			console.log('IP blacklisted');
    			cbFail.apply(cbScope, []);
    			
    			return;
    			
    		}
    	}
    	
    	console.log('IP OK');
    	cbSuccess.apply(cbScope, []);
    	
		});
		
	} else {	
		
		console.log('IP OK (no blacklist set)');
		cbSuccess.apply(cbScope, []);
		
	}
}	

module.exports = Rupert;