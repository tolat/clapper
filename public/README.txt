
Fixes:

-   Set different auto number ranges for each group (DONE)
-   tax for rentals from rentals sheet, not from crew sheet (DONE)
-   hide rows and columns (DONE)
-   man days materials and rentals in cost report and estimate (DONE)
-   tax column for purchases (DONE)
-   frozen columns option (DONE)
-   tie colors to departments + option to color code (DONE)
-   Allow autoEdit when arrow keys are pressed for navigation (DONE)
-   Display correct info in shows table on home page (DONE)
-   Roll over rentals into next week (DONE)
-   Make departments not case sensitive (DONE)
-   Change double click to edit to start typing and editor opens (DONE)
-   Fix all safari flex-shrink problems (DONE)
-   No zero values for blank columns (DONE)
-   parse numbers from dollar strings (DONE)
-   Loading screen for copy paste events and redo undo copy paste (DONE)
-   Warn when navigating away from a page if not saved (DONE)
-   Anything that is money, align right of cell (DONE)
-   Make auto fill range edit feature (starting at active cell) (DONE)
-   Crew page total crew working for the week -> NOT CLEAR ON THIS 
-   choose editor when adding new column (DONE)
-   only delete cell if editor isnt open (DONE)
-   return goes down a cell (DONE)
-   always add 5 empty rows at end (DONE)
-   copy paste option on right click (DONE)
-   fix auto fill on paste (DONE)
-   Allow duplicates in crew sheet (DONE)
-   FIX SORTING NUMBER COLUMN PROBLEM (DONE)
-   FIX RETURN ON ETNER IN SAFARI CREW PAGE (DONE)
-   Week Ending bar shows week # (DONE)
-   Display weeks (DONE)
-   Week based crew list (DONE)
-   Re-write paste function (DONE)
-   Save Undo Redo Button On toolbar  (DONE)
-   ** UPDATE MATH ON PASTE ** (DONE)
-   Undo does not un-create sets/crew/etc (FIXED DONE)
-   *********** NEW ESTIMATE VERSION DUPLICATES ALL SETS FIX *************** (DONE)
-   Calculate required rows based on group size if items are grouped! (DONE)
-   NEW WEEK ISN'T POPULATING PROPERLY. NEED TO MAKE SURE DAYS WEOKRED ARE DELETED WHEN A USER POSITION IS REMOVED FROM A WEEK
    AND NEED TO MAKE SURE WE UPDATE THE RECORD WHEN CREATING A NEW WEEK PORPERLY (DONE)
-   ADD week doesn't work on safari for some reason (just add placeholder) (DONE)
-   Paste function leaves a row in after repetitive redo when adding new rows(DONE)
-   re write paste function (DONE)
-   Figure out validation on save - done in estimate sheet but not in rest (started in crew) (DONE)
-   Grey out pages that need to be set after others when creating new show (DONE)
-   if required for save fields are left blank on save, warn (DONE)
-   sort purchases by week option (Done)
-   Drop down for all department fields + positions list in crew and rentals (DONE)
-   sort option in context menu for columns -> click on column selects column (DONE)
-   context menu opotion to select row (DONE)
-   SAVE STYLES EVEN IF DATA IS EMPTY (DONE)
-   Add validation to fields and modals (DONE)
-   Prevent copy out of hidden columns (DONE)



TODO:

1. Grid Mechanics
-   Auto save option (more like auto backup so if page is left without saving it has most recent verision. deleted when saved.)
-   Man Days in cost report count days a crew member worked not amount of money spent/manday rate

2. Timesheets

3. Styling Toolbar (Get cell styles to presist through grouping events)
    Need to add updates to styles when:
        -   Grouping is changed
        -   Sorting
        -   adding and removing rows
        -   Attach styles to the item id not the row

4. Permission based access

5. Audit Page for Indivicual crew members -> rows are days worked, cols are show, set, hours, position

6. Make available offline
    Use system where a script is downloaded that installs mongodb if not already installed, and runs the app locally after cloning the most 
    recent online database. then when desired the user can upload the changes to the master online database -  this would work best paired with
    a desktop app that can be used to do the database changing/uploading/downloading, it just uses the browser to do the rendering.
    EDIT: the whole app could be run as a desktop app, just online and offline and other settings are chosen from the desktop app, but the app
    rendering is done using the browser. Then app can be used as a web app on mobile etc., but can also be downloaded as a desktop app for offline use
    when needed. Allow user to download individual shows for offline use. then when updating, just update all master db objects associated with that show.
