Marlowe
=======

Researches and organizes media file libraries

What it does
------------

1. Guesses the title, year etc. based on existing filenames alone
2. Researches as much information about titles online
  - Genres
  - Budget
  - Country
  - Language
  - Critic ratings
3. Proposes file path and file name for file and moves file (and any existing subtitles) to new location.
4. Attempts to download trailer for title

Installation
------------

Install bks
```bash
$ npm install marlowe -g
```

Getting started
---------------

```bash
$ marlowe
```

You will be prompted for the following info:

**IN dir**  
The full filepath to the root directory of unsorted media files to trawl. This dir will be emptied over time as files are processed and copied to the **OUT** dir.  

WARNING Any existing folders in this dir will be deleted, as well as files that begin with `.`.  

All media files will be processed, subtitle files will be retained if they have the exact same name as the media files.  

All other files will be moved to the **FAIL** dir. 

**OUT dir**  
The full filepath to the root directory of where to organize the media file library. Ideally this would be an empty directory to begin with, or previously organized by Marlowe.

**FAIL dir**  
A separate folder to put files that failed to parse, duplicates or files of invalid extensions. Ideally this would be an empty directory to begin with, or previously used by Marlowe.

**Blacklist IPs**  
The script will not run if the public IP of the system running the script is detected to be any IPs entered here.

**Debug mode**  
If true then a JSON data file will be saved next to the renamed media files and browser windows will be visible during processing.

Disclaimer
----------

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Release History ###

- v0.1.0 - Initial release
