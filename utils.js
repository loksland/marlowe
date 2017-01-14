
var fs = require('fs');
var path = require('path'); 
//var moment = require('moment');

var utils = module.exports = {};

// Converts human readable |str| to a boolean. 
// Case insensitive. 
// Eg. true, yes, y, 1 VS false, no, n, 0
utils.stringToBool = function(str){
	
	if (!str || str.length === 0){
		return false; 
	}
	
	str = str.toLowerCase();
	return str.charAt(0) === 'y' || str.charAt(0) === '1' || str.charAt(0) === 't';
	
};

// Trims whitespace at start and end of string
utils.trim = function(str) {
	str = String(str);
  return (str && str.replace) ? str.replace(/^\s+|\s+$/g, '') : str;
};

// Returns true if |str| is not null or undefined and has any non-whitespace content
utils.isSet = function(str){
	
	if (typeof str === 'undefined'){
		return false;
	}
	if (str){
		return utils.trim(str).length > 0;
	}
	
	return false;
	
};

utils.isObjectAnError = function(obj){
	return Object.prototype.toString.call(obj).toLowerCase() === '[object error]';
};

utils.isBool = function(obj){
	return (typeof obj) === 'boolean';
};

utils.isNum = function(obj){
	return (typeof obj) === 'number';
};

utils.isStr = function(obj){
	return (typeof obj) === 'string';
};

//utils.isMomentObj = function(obj){
//	return Boolean(obj._isAMomentObject);
//};

utils.shallowDupe = function(obj){

	var dupeObj = {};
	for (var p in obj){
		dupeObj[p] = obj[p];
	}
	
	return dupeObj;
	
};

// Debugging

// Converts object to string and outputs to console.
utils.pr = function(obj){
	
	console.log(utils._pr(obj));
	
};

utils._pr = function(obj){
	
	return JSON.stringify(obj, null, 2);
	
};

utils.appendPropsToObj = function (baseObj, appendObj, overwriteIfExists){

	for (var p in appendObj){
		
		if (overwriteIfExists || baseObj[p] === undefined){
			baseObj[p] = appendObj[p];
		}
		
	}
	
	return baseObj;

};

utils.addPropsOverrideNonObjectsIfExists = function(objBase, objAdd){

	for (var p in objAdd){
		
		if (objBase[p] && typeof(objBase[p]) == 'object' && !Array.isArray(objBase[p])){
		
			objBase[p] = utils.addPropsOverrideNonObjectsIfExists(objBase[p], objAdd[p]);
			
		} else {
			
			objBase[p] = objAdd[p];
			
		}
	}
	
	return objBase;
	
};

// File utils
// ----------
// |dir| Directory path to be created
// |withinDirOnly| Directories will not be created outside this directory 
// |_dirNameQueue| Internal use
utils.mkdirSyncRecursive = function(dir, withinDirOnly, _dirNameQueue) {
		
		dir = utils.addTrailingSlash(dir);
		withinDirOnly = withinDirOnly ? utils.addTrailingSlash(withinDirOnly) : null;
		
		if (withinDirOnly && (dir === withinDirOnly || dir.length < withinDirOnly.length || dir.substr(0,withinDirOnly.length) !== withinDirOnly)){
			return false;
		}
		
		_dirNameQueue = _dirNameQueue ? _dirNameQueue : [];
    
    try { fs.mkdirSync(dir); }
    catch (e) {
    	// Dir wasn't made, something went wrong
    	
    	var dirName = path.basename(dir);
    	var containingDir = path.dirname(dir);
    	_dirNameQueue.splice(0, 0, dirName);
    
      return utils.mkdirSyncRecursive(containingDir, withinDirOnly, _dirNameQueue);
        
    }
    
    if (_dirNameQueue.length === 0){
    	return true;
    } 	
    
    dir = dir + _dirNameQueue[0];
    _dirNameQueue.splice(0, 1);
    
    return utils.mkdirSyncRecursive(dir, withinDirOnly, _dirNameQueue);

};

utils.addTrailingSlash = function(dirPath){

	if (dirPath.charAt(dirPath.length - 1) !== path.sep){
		return dirPath + path.sep;
	} 
	
	return dirPath; 
	
};

// Usage:
// `throwError(err);`
utils.throwError = function(err, cont){
	
	cont = typeof cont !== 'undefined' ? cont : true; // optional
	
	if (!utils.isObjectAnError(err)){
		err = new Error(err);
	}
	
	console.log(err.message);
	//console.log(err.stack);
	console.log();
	
	if (!cont){
		process.exit(1);
	}
	
}

utils.pad = function(string, size, char) {
  var i, pad, prefix, _i, _ref;
  if (char == null) {
    char = ' ';
  }
  prefix = typeof string === 'number';
  if (prefix) {
    _ref = [string, size], size = _ref[0], string = _ref[1];
  }
  string = string.toString();
  pad = '';
  size = size - string.length;
  for (i = _i = 0; 0 <= size ? _i < size : _i > size; i = 0 <= size ? ++_i : --_i) {
    pad += char;
  }
  if (prefix) {
    return pad + string;
  } else {
    return string + pad;
  }
};

utils.isPathWithinPath = function(pathA, pathB){ // Is A in B

	pathA = path.resolve(pathA).toLowerCase();
	pathB = path.resolve(pathB).toLowerCase();

	if (pathA.length > pathB.length){
		if (pathA.substr(0,pathB.length) == pathB){
			return true;
		}
	}
	
	return false;

}

utils.getDirectories = function(srcpath) {
  
  return fs.readdirSync(srcpath).filter(function(file) {
    return fs.statSync(path.join(srcpath, file)).isDirectory();
  });
  
}

utils.getFiles = function(srcpath) {

  return fs.readdirSync(srcpath).filter(function(file) {
    return !fs.statSync(path.join(srcpath, file)).isDirectory();
  });
  
}

// |containingPath| is for safety.
utils.deleteRecursive = function(fsPath, containingPath) {
	
	if (typeof fsPath === 'undefined'){
		throw new Error('Path not defined');
	}
	
	if (typeof containingPath === 'undefined'){
		throw new Error('`containingPath` must be defined');
	}
	
	if (!utils.isPathWithinPath(fsPath, containingPath)){ 
		throw new Error('`path` not in `containingPath`');
	}
	
	fsPath = path.resolve(fsPath);
	if (fsPath.split(path.sep).length < 4){
		throw new Error('Invalid path: too shallow');
	}
	
  if(fs.existsSync(fsPath)) {
  	
  	if(fs.lstatSync(fsPath).isDirectory()) {
  
			fs.readdirSync(fsPath).forEach(function(file,index){
				utils.deleteRecursive(fsPath + path.sep + file, containingPath);
			});
		
			fs.rmdirSync(fsPath);
    	
    } else {
    	
    	fs.unlinkSync(fsPath);
    	
    }
  }
};

utils.isFileOfExtension = function(fsPath, extList){
	
	return utils.isExtofExtensions(path.extname(fsPath), extList);
	
}

utils.isExtofExtensions = function(ext, extList){
	
	var ext = ext.toLowerCase();
	ext = ext.charAt(0) == '.' ? ext : '.'+ext;
	
			
	extList = Array.isArray(extList) ? extList : [String(extList)];
	
	if (utils.isSet(ext)){
		
		for (var i = 0; i < extList.length; i++){
			var listExt = extList[i].toLowerCase();
			if (listExt == '*'){
				return true;
			}
			listExt = listExt.charAt(0) == '.' ? listExt : '.'+listExt;
			if (ext == listExt){
				return true;
			}
		}
		
	}
	
	return false;

}

// The suffix exists at end of file base line
utils.isFileOfSuffix = function(fsPath, suffixList){
	
	suffixList = Array.isArray(suffixList) ? suffixList : [String(suffixList)];
	var base = path.basename(fsPath, path.extname(fsPath));
	
	for (var i = 0; i < suffixList.length; i++){
		if (base.length > suffixList[i].length && base.substr(base.length-suffixList[i].length, suffixList[i].length) == suffixList[i]){
			return suffixList[i];
		}
	}
	
	return false;

}



utils.uniquePath = function(fsPath, _attemptCount) {

	_attemptCount = typeof _attemptCount !== 'undefined' ? _attemptCount : 0;
	
	if (_attemptCount > 1000000){
		throw new Error('`utils.uniquePath()` seems to be in an infinite loop');
	}
	
	if (fs.existsSync(fsPath)){
		
		var ext = path.extname(fsPath);
		var base = path.basename(fsPath, ext);
		var dir = path.dirname(fsPath);
		
		var regex = /^(.*) ([0-9])$/g;
	
		var m;
		
		while ((m = regex.exec(base)) !== null) {
				// This is necessary to avoid infinite loops with zero-width matches
				if (m.index === regex.lastIndex) {
						regex.lastIndex++;
				}
				if (m.length == 3){
					var core = m[1];
					var num = Number(m[2]);
					return utils.uniquePath(path.join(dir, core + ' ' + String(num+1) + ext), _attemptCount + 1);
				} 
		}
		
		return utils.uniquePath(path.join(dir, base + ' 2' + ext), _attemptCount + 1);
		
	}
	
	return fsPath;

}


utils.sanitizeFilenameForFileSystem = function(filename, replaceChar, allowExtendedPunctuation){
	
	replaceChar = typeof replaceChar !== 'undefined' ? replaceChar : ' ';
	allowExtendedPunctuation = typeof allowExtendedPunctuation !== 'undefined' ? allowExtendedPunctuation : false;
	
	// Invalid chars: / ? < > \ : * | " ^ :
	var regex;
	if (allowExtendedPunctuation){
		regex = /([^ a-z0-9!_'.${}()&\-#@%,\[\]|~`+=]+)/gi;
	} else {
		regex = /([^ a-z0-9_'.$%&\-,+(){}\[\]]+)/gi;
	}
	
	return filename.replace(regex, replaceChar); 
	
}

// in `http://blabla.com/foo/bar/tmp.html`
// out `http://blabla.com`
// needs `//` at start 
utils.rootURL = function(url){
	return url.toString().replace(/^(.*\/\/[^\/?#]*).*$/,"$1");
}


utils.doesStrBeginWithStr = function(strTarget, strStart, caseIndifferent){
	
	caseIndifferent = typeof caseIndifferent !== 'undefined' ? caseIndifferent : true;
	
	if (caseIndifferent){
		strTarget = strTarget.toLowerCase();
		strStart = strStart.toLowerCase();
	}
	
	return strTarget.length >= strStart.length && strTarget.substr(0, strStart.length) == strStart;

}

utils.shuffleArray = function(array) {
	for (var i = array.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
	return array;
}