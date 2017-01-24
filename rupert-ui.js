#! /usr/bin/env node

// Rupert UI
// =========


var utils = require('./utils');
var path = require('path'); 
var fs = require('fs'); 
var Rupert = require('./rupert');
var utils = require('./utils');
var readlineSync = require('readline-sync');


function RupertUI(){
	
	/*
	// Storing user settings 
	settings.set('username', 'rev087');
 
	// Retrieving user settings 
	var username = settings.get('username');
	*/
	
	var settings = require('user-settings').file('.marlowe-settings');
	
	console.log('');
	
	var inDirDefault = settings.get('in-dir');
	var inDir = readlineSync.question('IN dir?\n' + (utils.isSet(inDirDefault) ? '('+inDirDefault+')\n' : ''), {
		defaultInput: inDirDefault // The typed text on screen is hidden by `*` (default). 
	});
	inDir = escapeShell(inDir);
	if (!fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()){
		throw new Error('Invalid input');
	}	
	settings.set('in-dir', inDir);
	if (!utils.isSet(inDirDefault)){
		console.log('');
	}
	
	var outDirDefault = settings.get('out-dir');
	var outDir = readlineSync.question('OUT dir?\n' + (utils.isSet(outDirDefault) ? '('+outDirDefault+')\n' : ''), {
		defaultInput: outDirDefault // The typed text on screen is hidden by `*` (default). 
	});
	outDir = escapeShell(outDir);
	if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()){
		throw new Error('Invalid input');
	}
	settings.set('out-dir', outDir);	
	if (!utils.isSet(outDirDefault)){
		console.log('');
	}
	
	var failDirDefault = settings.get('fail-dir');
	var failDir = readlineSync.question('FAIL dir?\n' + (utils.isSet(failDirDefault) ? '('+failDirDefault+')\n' : ''), {
		defaultInput: failDirDefault // The typed text on screen is hidden by `*` (default). 
	});
	failDir = escapeShell(failDir);
	if (!fs.existsSync(failDir) || !fs.statSync(failDir).isDirectory()){
		throw new Error('Invalid input');
	}
	settings.set('fail-dir', failDir);		
	if (!utils.isSet(failDirDefault)){
		console.log('');
	}
	
	var blacklistIPDefault = settings.get('blacklist-ips');
	var blacklistIPs = readlineSync.question('Blacklist IPs?\n' + (utils.isSet(blacklistIPDefault) ? '('+blacklistIPDefault+')\n' : ''), {
		defaultInput: blacklistIPDefault // The typed text on screen is hidden by `*` (default). 
	});
	settings.set('blacklist-ips', blacklistIPs);
	blacklistIPs = utils.isSet(blacklistIPs) ? blacklistIPs.split(',') : [];
	if (!utils.isSet(blacklistIPDefault)){
		console.log('');
	}


	
	
	var debugModeDefault = settings.get('debug-mode');
	var debugModeDefaultSet = typeof debugModeDefault !== 'undefined' && debugModeDefault != null;
	if (!debugModeDefaultSet){ // Set default
		debugModeDefault = false;
		debugModeDefaultSet = true;
	}
	var debugPrompt = '';
	if (!debugModeDefaultSet){
		debugPrompt = '[y/n]';
	} else if (debugModeDefault){
		debugPrompt = '[(y)/n]';
	} else {
		debugPrompt = '[y/(n)]';
	}
	var debugModeInput = readlineSync.question('DEBUG?\n'+debugPrompt+':\n', {
		defaultInput: debugModeDefault ? 'Y' : 'N' // The typed text on screen is hidden by `*` (default). 
	});
	debugMode = utils.stringToBool(debugModeInput);
	settings.set('debug-mode', debugMode);
	
	if (debugMode){
		Rupert.applyDebugMode()
		console.log('DEBUG MODE\n');
	}
	
	
	console.log('MARLOWE');
	console.log('======');
	
	var r = new Rupert();
	r.goCrawl(inDir,
					outDir,
					failDir,
					blacklistIPs);

	
};

function escapeShell(cmd) {
  return cmd.split("\\ ").join(' ');
};



module.exports = new RupertUI;