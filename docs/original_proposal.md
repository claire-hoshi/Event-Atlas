# Claire Hoshi

Senior Project Proposal

EventAtlas: A Campus Event Organization Map

Section: Maria Webb

Sept 11, 2025


## Table of Contents

- Project Summary
- Significance
- Required Tools & Availability
- Demonstration Plans
- Qualifications
- Project Specifications
- Functional Specifications
- User Interface Specification
- Technical Details
- Developer Work Plan
- Timeline
  - Checkpoint #1 (Sep 25)
  - Checkpoint #2 (Oct 9)
  - Checkpoint #3 (Oct 30)
  - Checkpoint #4 (Nov 20)
- Future Enhancements
- Ethical Considerations
- Bibliography


## Project Summary

For many college students, managing campus events can be time-consuming when data is scattered across different platforms, such as social media, emails, bulletin boards, and flyers. EventAtlas, a web application, aims to solve this problem by putting the whole event data into an interactive map-based system. EventAtlas primarily uses HTML, CSS, and JavaScript for a clean and easy user interface, allowing students to search events, filter them by category, time range, or location. Leaflet.js, with the OpenStreetMap tileset, will provide event visualization in a map view.

The backend uses Firebase for authentication, data storage, and notifications, ensuring that only DePauw accounts can create or edit events. Event attendees can mark events saved to their personal lists, RSVP as needed, and receive notifications when event details change. Event organizers can create events using a form that lets them draft, edit, and publish. In addition to the web application, EventAtlas is available on a public kiosk at Roy O. West Library, allowing students to physically interact with the system to view weekly events publicly without the option to sign in.


## Significance

The EventAtlas will help address the issue of scattered on-campus event details by integrating them into a single map-based web platform. This system will allow students to explore event details via a map system and filter events by category, location, or time. Organizers can easily create events through a calendar-style form, where they can see all the attendees of the event as a single list once the users have registered for an event. By simplifying access to event information, the project enhances campus engagement and offers a practical, accessible solution to a common student challenge (Colleen).

Most of the scope of this project does not relate to any of the material taught in DePauw’s computer science department, but rather information obtained through online courses and an internship. In web development, it combines HTML, CSS, and JavaScript to create a responsive and user-friendly interface. In data management, Firebase is used for data storage and event data integration. In geographical information systems (GIS), interactive map capability is achieved using Leaflet.js and OpenStreetMap, which allows users to visualize events in space. Finally, by implementing the web application in an interactive kiosk, the project demonstrates human-computer interaction (HCI) by bringing a digital interface into a physical, touchable environment (Oyeman). The EventAtlas combines both front-end and back-end development, making this a full-stack project.


## Required Tools & Availability

This project will require access to a Mac computer and a Windows Computer, as well as the following software: Visual Studio Code, Firebase, Figma, GitHub, Bootstrap, and a search engine to install JavaScript libraries as needed. I will use my personal MacBook laptop for the initial programming stage, which is running OS Sequoia 15.4.1 and has Visual Studio Code 1.103.2 installed. In Visual Studio Code, I will program in HTML 5, CSS 3, and client-side JavaScript (ES6), running in modern web browsers, combined with the Leaflet.js v1.7.1 library and the live OpenStreetMap tiles for interactive mapping. I will use GitHub to store my progress and previous versions of the EventAtlas. I will use the Windows 11 laptop, which has a touchscreen, in Roy. O. West Library, with the assistance of the ITAP program, with Professor Michael Boyles (Boyles). In a Windows laptop, I will convert the programmed web application into an interactive kiosk to embed the Campus Event Map by adjusting the responsive design to deploy and run the finished experience on a touchscreen display.


## Demonstration Plans

For the first three checkpoints, a demonstration of the EventAtlas will be done in the Linux Lab. For the final checkpoint, the presentation of the interactive Kiosk will be done in the Linux Lab, but showcased through a video of me interacting with the kiosk in the Roy O. West Library. To ensure that everything works properly, I will practice my demonstration ahead of time by recording a mock Zoom meeting. Additionally, I plan to join our Zoom class meeting to screen share from my laptop, using it as the preferred method (the link to join will be sent by the professor ahead of time). However, I will also have an HDMI adapter necessary to display my Mac on the projector if needed. In the event of unexpected issues, I will record my presentation in advance and share it with the professor.


## Qualifications

Last summer, I enrolled in an Udemy course to teach myself HTML and CSS, aiming to build a web application (YouAccel Training). I learned the basics of the language and created simple websites with minimal functionality. In the Fall of 2024, I enrolled in a Computer Graphics course, Programming 3D Applications, at DIS Copenhagen (Lüders). This course allowed me to become familiar with the basic types used for creative expression using JavaScript, which are also applicable in website building. This past summer, I worked as a UI/UX designer for a 3D computer graphics (3DCG) startup. My work focused on building a landing page for the company using Figma as the framework and using HTML, CSS, and JavaScript to create user-friendly interfaces. Outside of work, I have enrolled in a Udemy course to learn Firebase, in which I created a user auth system using Firebase & JavaScript (Tamil). Additionally, I have begun exploring Leaflet.js documentation to familiarize myself with map integration. Given my hands-on experience, I am confident in my ability to quickly adapt and build a polished, responsive front-end map for the EventAtlas (Leaflet) (MapTiler).


## Project Specifications


### Functional Specifications

The EventAtlas will have two types of users: attendees and organizers. All users can create an account by registering with a DePauw email address and password, which will then allow them to log in to the web application. If the user logs in as an organizer, they will have a dedicated account for the organization, which can be shared among other members in the same organization. After logging in, attendees can search for upcoming events by title, keywords, organizer, or location, and filter by category and date range. Attendees can save events they wish to attend to saved lists; if the event requires an RSVP, attendees can directly use the RSVP button.

Organizers can create and edit events, choose a location via building search or by dropping a pin on the map, add images and tags, and save drafts. When ready, the organizers can submit events, but the system also allows them to edit or archive them even after submission. Time or location updates will notify the attendees who have saved the event via email. Organizers can see the list of attendees who have saved the event. For an oversight measure, the system will also include a reporting function available to both event organizers and attendees. Attendees may report events that they believe are misleading or inappropriate, while event organizers may report attendees, such as those who have caused harm during the event or who are repeat RSVP no-shows. The reports are recorded and sent to the Student Government at DePauw. As a whole, the web application will have DSG to view the admin console page, to track event activity, unpublish events, or warn event organizers or participants.

The kiosk in Roy O. West presents the same content as the web application, featuring an interactive panel, but only in attendee mode. This mode displays all events happening that week without the RSVP function, serving as an open map rather than a personalized portal accessible to the public.


### User Interface Specification

Fig.1: Sample user interface of Event Atlas (attendee’s view)

Fig.2: Sample user interface of Event Atlas (organizer’s view)

The user interface of the EventAtlas will primarily consist of the full-width campus map and a control panel on the left (Fig.1). From the panel, users can search events by keyword, then narrow options by using the dropdown for Location and Time. Below the search section, category filters appear as a set of filter chips. Based on the search result, the event will appear as a card that users can scroll through. By selecting the event, the event details, including title, date, time, location, description, and RSVP, will appear in full event view. When the RSVP link is clicked, a confirmation message will be shown, and the data is then stored within its respective Firebase Collection.

The organizer will see a form to create an event by entering the event name, organization, category, and contact email (Fig. 2). The user then specifies the start and end date and time using calendar selectors, enters maximum attendees as an option, uploads a photo, and publishes a description. Asterisks are added for required fields, and inline validation is added to verify accuracy. Once submitted, the event is stored as a draft that may be later edited by organizers, completed, and submitted for review before posting.


## Technical Details

The front end of the EventAtlas will be developed with HTML, CSS, and JavaScript, with an interactive map view powered by Leaflet.js (Leaflet). OpenStreetMap will be used to provide the base tile layer, upon which markers will be placed to set event locations (OpenStreetMap). Markers will be interactive and linked to an event card, with detail views built using Firestore queries (Firebase). Organizers will interact with a browser-based content management form, also constructed in JavaScript and interfaced to Firebase. Inline validation will ensure that mandatory fields such as title, time, and location are correctly filled before submission (MDN). Events will be stored as drafts initially, with the option to edit, publish, or archive depending on workflow decisions.

The back end will be done primarily by Firebase, which will host authentication and data storage (Firebase). Firebase Authentication will be used to limit event editing to DePauw Google accounts, ensuring only authorized organizers can create or edit events. Event details such as title, description, time, and location will be stored in Firebase Firestore, while Firebase Storage will store uploaded images such as organizer logos or event banners. To notify attendees of changes to saved events, Firebase Cloud Messaging will be used to send push notifications when location or time changes occur. Each event will have a unique ID that will be used throughout Firestore and Storage, allowing for simple querying and updating of event data.

The same application will be integrated into DePauw’s kiosk system by adjusting the responsive UI design, allowing the map-based interface to be displayed on interactive (touch-enabled) hardware in Roy O. West Library. Kiosk mode will be available in attendee mode, which allows public events with minimal navigation of the events and no RSVP functionality.


## Developer Work Plan

- Week of Aug 25: Finalize the preliminary proposal and submit. Begin researching the necessary Leaflet.js library and details about the OpenStreetMap for map integration. Talk to Michael Boyles about the Kiosk implementation at the Roy O. West Library. Start working on the full proposal.
- Week of Sept 1: Draft the full proposal and schedule a review with Professor Maria for feedback. Start building UI on Figma. Focus on setting up the project environment in Visual Studio Code and configuring version control with Git/GitHub.
- Week of Sept 15: Configure the GitHub repository (est. 2 hours), set up a Firebase project with Authentication, Firestore, and Storage activated (est. 3 hours), and create a basic HTML/CSS/JavaScript project directory (est. 3 hours). Code the first draft of the Firestore event data schema, including fields such as title, description, start and end time, location, category, and organizer metadata (est. 4 hours). Install and test Leaflet.js with OpenStreetMap tiles to verify that the campus map displays correctly on a test page (est. 3 hours). Total time estimate: 15 hours.
- Week of Sept 22: Prepare for Checkpoint 1. Implement Firebase Authentication to enable sign-up and login with DePauw Google accounts (est. 5 hours). Add four sample events to Firestore using the schema and load them onto the Leaflet map with category-specific or organization icons (est. 9 hours). Conduct a self-test to ensure that sample events saved in Firestore consistently display the same way on the map, regardless of logging out and back in or switching to a different browser (est. 1 hour). Record a backup video demo and upload presentation materials to Moodle (est. 2 hours). Total time estimate: 17 hours.
- Week of Sept 29: Design the first event creation form UI (est. 6 hours). Restrict form access so only event organizers (authentication) can create events (est. 3 hours). Implement validation rules for required fields such as title, time, and location, along with proper email format (est. 3 hours). Test “Save Draft” integration with Firestore by storing form submissions as draft documents (est. 4 hours). Ask my classmate to try the draft form and check if it feels easy to use (est. 2 hours). Total time estimate: 18 hours.
- Week of Oct 6: Prepare for Checkpoint 2. Complete the event creation form by adding optional fields, including event image, maximum attendees, and description (est. 4 hours). Begin designing the reporting function UI (for attendees and organizers) and set up a placeholder Firestore collection to store reports (est. 3 hours). Add a map feature where organizers can drop and move a pin to set the event location (est. 5 hours). Create simple Firestore rules to make sure only DePauw accounts can post and that required fields are filled before publishing (est. 3 hours). Ask my classmate to try making events and saving drafts to test the flow (est. 2 hours). Record a backup video demo and upload presentation materials to Moodle (est. 2 hours). Total time estimate: 19 hours.
- Week of Oct 13: Add category filters as chips to the sidebar (est. 4 hours) and link them with Firestore so events show or hide by category (est. 5 hours). Implement reporting submission flow with Firestore integration (est. 4 hours). Write down any bugs or problems found in the draft-to-publish flow for fixing later (est. 3 hours). Run a short test with classmates to see if filtering feels clear or confusing (est. 3 hours). Total: 19 hours.
- Week of Oct 20: Add notification function. Add Firebase Cloud Messaging so attendees can subscribe to events and get updates when times or locations change (est. 7 hours). Keep Firestore Security Rules very simple, only making sure that event creators can edit their own events (est. 4 hours). Build DSG admin console to view submitted reports, track event activity, and manually unpublish events (est. 4 hours). Conduct small tests with my classmate to verify that notifications are delivered correctly across various devices (est. 1 hour). Begin exploring kiosk integration with handling the responsive design (est. 7 hours). Total time estimate: 23 hours.
- Week of Oct 27: Prepare for Checkpoint 3. Finalize the notification workflow and test it on different browsers and devices (est. 4 hours). Simplify the event publishing flow to ensure smooth transitions between draft and published states (est. 4 hours). Test category filters with several events to confirm stability (est. 3 hours). Record a backup video demo and upload presentation materials to Moodle (est. 2 hours). Continue exploring with kiosk integration (est. 7 hours). Total time estimate: 20 hours.
- Week of Nov 3: Complete embedding the EventAtlas in Windows and test it on a kiosk setup (est. 8 hours). Conduct touchscreen tests and marker interactivity at kiosk resolution (est. 5 hours). Consult with Michael Boyles and conduct user testing with three students in kiosk mode, focusing on navigation and gathering feedback (est. 3 hours). Finish responsive design adjustments for both desktop and kiosk environments (est. 3 hours). Total time estimate: 19 hours.
- Week of Nov 10: Focus on responsive refinement and usability testing. Adjust UI for laptop and kiosk screens to ensure proper scaling of buttons and text (est. 5 hours). Conduct usability testing with my classmates, asking them to complete core tasks such as creating an event, saving drafts, filtering by category, and kiosk navigation (est. 6 hours). Implement feedback-driven adjustments, including improved error messages, optimized button placement, and enhanced accessibility contrast (estimated 5 hours). Begin drafting sections of the final report (est. 2 hours). Total time estimate: 18 hours.
- Week of Nov 17: Prepare for the final presentation (Nov. 20). Record a full backup video demo covering all major features (est. 3 hours) at Roy O. West Library. Create final presentation slides including screenshots of responsive design and kiosk integration (est. 3 hours). Conduct one final peer usability test to rehearse demo steps and confirm reliability (est. 3 hours). Rehearse the presentation (est. 3 hours). Use remaining time to polish the code, update documentation, and finalize the GitHub repository (est. 4 hours). Total time estimate: 16 hours.
- Week of Nov 24: Draft the final written report and seek feedback from Professor Maria and W Center (est. 20 hours). Total time estimate: 20 hours.
- Week of Dec 1: Finalize the report by editing any points that I received from the feedback, and upload the completed report to Moodle. Total time estimate: 15 hours.


## Timeline

### Checkpoint #1 (Sept 25)

- I will demonstrate Firebase Authentication by creating a new user account, logging in with that account, and opening a simple profile page to confirm the login worked.
- I will demonstrate the Firestore event schema by loading at least four sample events into the database, each with a title, time, and category, and then displaying them on the map with different icons for each category.
- I will demonstrate consistency by logging out, switching to another browser, and showing that the same events appear correctly on the map, proving that the data is stored and retrieved the same way across sessions.

### Checkpoint #2 (Oct 9)

- I will demonstrate the event creation form by logging in with a DePauw Google account, filling in required fields such as title, time, and location, and showing that the form checks for missing information before saving.
- I will demonstrate the map-based location picker by dropping a pin on the map, dragging it to a new spot, and confirming that the correct coordinates are saved for the event.
- I will show saving an event as a draft by submitting it to Firestore, then displaying the draft marker on the map to confirm that the event is stored but not yet fully published.

### Checkpoint #3 (Oct 30)

- I will demonstrate category filtering by clicking on filter chips above the map, showing that event markers appear or disappear depending on which category is selected.
- I will demonstrate Firebase Cloud Messaging by subscribing to one event, then updating its details, and showing that a notification is received on another device.
- I will show the draft-to-publish workflow by creating an event as a draft, updating it to published, and then confirming that it becomes visible to all users on the map.
- I will demonstrate the admin console page, showing how to unpublish events and issue warnings based on the report submitted by the users.

### Checkpoint #4 (Nov 20)

- I will demonstrate kiosk integration by launching the EventAtlas on a touchscreen kiosk and interacting with it to confirm that the map and events work in kiosk mode.
- I will demonstrate responsive UI refinement by resizing the interface on both a desktop and a kiosk, showing that the layout and scaling adjust correctly for each environment.
- I will show the complete workflow by creating a draft event, publishing it, and then viewing it as a student attendee on the kiosk to confirm that the whole system works end-to-end.


## Future Enhancements

- In the future, the EventAtlas can be linked with current calendar platforms such as Google Calendar or Outlook so that students may import events into their personal calendars.
- While the initial version of the EventAtlas will be web-based, native apps for the Android and/or iOS platforms may be developed in the future.
- Personalized event suggestions can be incorporated, where the system suggests events to students based on their past attendance record or saved categories.
- In the long term, the kiosk version can be expanded to provide directions to walk from the kiosk to the events, and potentially allow users to “send” those directions to their phone via text or link, similar to how Google Maps lets users send the direction details.


## Ethical Considerations

As the EventAtlas collects and displays event information related to existing student organizations, ethical considerations regarding privacy, security, equity, and accessibility need to be addressed.

**Privacy and Confidentiality:** Event information will be stored in Firebase. Without security rules, there is an opportunity for misuse or accidental release. To correct this, Firebase Authentication and Firestore Security Rules will be implemented so that only authenticated DePauw accounts can create or edit events. Contact information and event details will be public, but no additional personal information will be collected.

**Security and Accountability:** Since student organizations may have multiple students who share accounts, accountability for changes and updates is a problem. Versioning will be used to track who made changes and when. Security policies, basic moderation, and keyword filters will be used to reduce the risk of event postings being inappropriate or malicious.

**Equity and Accessibility:** The kiosks will provide an open, non-personalized method of accessing event information. The accessibility guidelines, including providing sufficient contrast, readable text, and readable icons, will be applied to ensure the system is accessible to everyone.

**Transparency and Trust:** Students need to be clearly informed about the data being collected and how it is displayed. If attendance tracking or RSVP features are added in the future, students will be notified about what data is being stored and whether others can view it. Being open assists in establishing trust and conforms to campus values of inclusivity.


## Bibliography

- “Add Data to Cloud Firestore.” Firebase, https://firebase.google.com/docs/firestore/manage-data/add-data. Accessed 10 Sep. 2025.
- Benno Lüders. Computer Graphics: Programming 3D Applications. DIS Copenhagen, Aug.–Dec. 2024.
- Boyles, Michael. Personal interview/mentorship with Claire Hoshi. 9 Sept. 2025.
- “Client-Side Form Validation - Learn Web Development | MDN.” MDN Web Docs, 12 Aug. 2025, https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation.
- Flaherty, Colleen. “Campus Involvement: The Tech Connection.” Inside Higher Ed, https://www.insidehighered.com/news/student-success/college-experience/2023/10/13/why-so-many-students-want-campus-events-calendar. Accessed 10 Sep. 2025.
- MapTiler, “Leaflet JS Tutorial 101.” YouTube, Dec 14, 2018, https://youtube.com/playlist?list=PLGHe6Moaz52PUNP4DtIshALDogSURIlYB&si=yk7Ua9662POJXoSv.
- Oyeman, et al. “Campus Interactive Information Kiosk with 3D Mapping.” International Journal of Creative Research Thoughts (IJCRT), vol. 12, no. 6, 2024, pp. 968–978.
- “Perform Simple and Compound Queries in Cloud Firestore.” Firebase, https://firebase.google.com/docs/firestore/query-data/queries. Accessed 10 Sep. 2025.
- Quick Start Guide - Leaflet - a JavaScript Library for Interactive Maps. https://leafletjs.com/examples/quick-start/. Accessed 10 Sep. 2025.
- Tiles - OpenStreetMap Wiki. https://wiki.openstreetmap.org/wiki/Tiles. Accessed 10 Sep. 2025.

