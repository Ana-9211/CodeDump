-- =====================================================================
-- 07_seed_catalog.sql : sample books (run AFTER the demo users exist)
-- A fantasy and children's catalogue. Titles and authors are real books; the ISBNs are ILLUSTRATIVE
-- (valid check digit, not the real ones). Cover images are drawn by the app (see StoryCover), so cover_url stays NULL.
-- Shows: temp table, unnest WITH ORDINALITY (keeps author order), LATERAL join, INSERT..SELECT.
-- =====================================================================

CREATE TEMP TABLE seed_books (
    n SERIAL,   -- keeps the order of the rows below, so book_id 1..53 always follows this list
    seller_email TEXT, isbn TEXT, title TEXT, category TEXT, price_cents INT,
    stock INT, language TEXT, description TEXT, status TEXT, authors TEXT[]
);

INSERT INTO seed_books (seller_email, isbn, title, category, price_cents, stock, language, description, status, authors) VALUES
    ('seller1@bookstore.test', '9789331863508', 'Winnie-the-Pooh', 'Classics', 24900, 41, 'English', 'A bear of very little brain and his friends wander the Hundred Acre Wood in search of honey.', 'approved', ARRAY['A.A. Milne']),
    ('seller1@bookstore.test', '9789331826237', 'The Very Hungry Caterpillar', 'Picture Books', 24900, 33, 'English', 'A caterpillar eats his way through the week and becomes a butterfly.', 'approved', ARRAY['Eric Carle']),
    ('seller1@bookstore.test', '9789331788962', 'Where the Wild Things Are', 'Picture Books', 24900, 37, 'English', 'Max sails to an island of wild things and is crowned their king, until supper calls.', 'approved', ARRAY['Maurice Sendak']),
    ('seller1@bookstore.test', '9789331751690', 'The Gruffalo', 'Picture Books', 24900, 44, 'English', 'A quick-thinking mouse invents a monster to scare off the hungry creatures of the wood, and then meets him.', 'approved', ARRAY['Julia Donaldson']),
    ('seller1@bookstore.test', '9789331714428', 'The Tale of Despereaux', 'Animal Stories', 29900, 24, 'English', 'A tiny mouse who loves music, light and a princess goes down into the dungeon.', 'approved', ARRAY['Kate DiCamillo']),
    ('seller1@bookstore.test', '9789331677150', 'Charlotte''s Web', 'Animal Stories', 24900, 35, 'English', 'A spider writes words in her web to save a pig from the butcher.', 'approved', ARRAY['E.B. White']),
    ('seller1@bookstore.test', '9789331639882', 'Fantastic Mr Fox', 'Animal Stories', 24900, 31, 'English', 'A very clever fox keeps outwitting three nasty farmers who want him gone.', 'approved', ARRAY['Roald Dahl']),
    ('seller1@bookstore.test', '9789331602619', 'Charlie and the Chocolate Factory', 'Adventure and Magic', 29900, 39, 'English', 'Five golden tickets open the gates of the most remarkable sweet factory in the world.', 'approved', ARRAY['Roald Dahl']),
    ('seller1@bookstore.test', '9789331565341', 'Matilda', 'Adventure and Magic', 29900, 43, 'English', 'A gifted girl outwits her neglectful parents and a tyrant headmistress.', 'approved', ARRAY['Roald Dahl']),
    ('seller1@bookstore.test', '9789330298165', 'A Wrinkle in Time', 'Adventure and Magic', 31900, 20, 'English', 'Three odd guardians help a girl fold space to rescue her father from a creeping darkness.', 'approved', ARRAY['Madeleine L''Engle']),
    ('seller1@bookstore.test', '9789330260896', 'The Hobbit', 'Epic and High Fantasy', 34900, 45, 'English', 'A comfort-loving hobbit is swept into a dragon-guarded treasure quest.', 'approved', ARRAY['J.R.R. Tolkien']),
    ('seller1@bookstore.test', '9789330633591', 'The Ocean at the End of the Lane', 'Dark Fantasy', 34900, 16, 'English', 'A duck pond that a neighbour girl calls an ocean hides something much older than the village.', 'approved', ARRAY['Neil Gaiman']),
    ('seller1@bookstore.test', '9789330596322', 'Neverwhere', 'Urban and Contemporary Fantasy', 34900, 23, 'English', 'A kind-hearted Londoner falls through the cracks into the strange city living beneath the pavements.', 'approved', ARRAY['Neil Gaiman']),
    ('seller1@bookstore.test', '9789330559051', 'The Invisible Life of Addie LaRue', 'Urban and Contemporary Fantasy', 44900, 21, 'English', 'A bargain made at dusk lets Addie live forever, on the condition that everyone she meets forgets her.', 'approved', ARRAY['V.E. Schwab']),
    ('seller1@bookstore.test', '9789330521782', 'Piranesi', 'Urban and Contemporary Fantasy', 39900, 17, 'English', 'A man lives happily in a house of endless halls and statues, until he starts to ask who he really is.', 'approved', ARRAY['Susanna Clarke']),
    ('seller1@bookstore.test', '9789330484513', 'The Night Circus', 'Dark Fantasy', 42900, 27, 'English', 'A black-and-white circus opens only at nightfall, and two young magicians are bound into a duel inside it.', 'approved', ARRAY['Erin Morgenstern']),
    ('seller2@bookstore.test', '9789331900777', 'A Beginner''s Guide to Dragon Husbandry', 'Humorous Fantasy', 29900, 10, 'English', 'Sample listing waiting in the admin approval queue.', 'pending', ARRAY['Demo Author']),
    ('seller1@bookstore.test', '9789330447242', 'The Princess Bride', 'Humorous Fantasy', 37900, 19, 'English', 'Pirates, giants, true love and a fencing duel, all told by an author who keeps abridging the dull parts.', 'approved', ARRAY['William Goldman']),
    ('seller1@bookstore.test', '9789330409974', 'The Hitchhiker''s Guide to the Galaxy', 'Humorous Fantasy', 32900, 38, 'English', 'Minutes before Earth is demolished, a man is whisked into space with a towel and a very helpful guidebook.', 'approved', ARRAY['Douglas Adams']),
    ('seller1@bookstore.test', '9789330372704', 'The Colour of Magic', 'Humorous Fantasy', 34900, 24, 'English', 'A cowardly wizard and the world''s first tourist set off across a flat world on the back of four elephants and a turtle.', 'approved', ARRAY['Terry Pratchett']),
    ('seller1@bookstore.test', '9789330335433', 'Good Omens', 'Humorous Fantasy', 39900, 26, 'English', 'An angel and a demon who rather like Earth try to stop the apocalypse arriving on schedule.', 'approved', ARRAY['Terry Pratchett','Neil Gaiman']),
    ('seller1@bookstore.test', '9789330223624', 'The Wonderful Wizard of Oz', 'Portal Fantasy', 24900, 33, 'English', 'A cyclone carries Dorothy to a country of Munchkins, a yellow brick road and a very humbug wizard.', 'approved', ARRAY['L. Frank Baum']),
    ('seller1@bookstore.test', '9789330186356', 'Coraline', 'Dark Fantasy', 29900, 30, 'English', 'Behind a small locked door is a second home with a mother who has buttons for eyes.', 'approved', ARRAY['Neil Gaiman']),
    ('seller1@bookstore.test', '9789330149085', 'The Neverending Story', 'Portal Fantasy', 39900, 18, 'English', 'A shy bookworm discovers that the book he is reading is reading him back.', 'approved', ARRAY['Michael Ende']),
    ('seller1@bookstore.test', '9789330111815', 'The Phantom Tollbooth', 'Portal Fantasy', 29900, 22, 'English', 'A bored boy drives a toy car through a tollbooth into a kingdom ruled by words and numbers.', 'approved', ARRAY['Norton Juster']),
    ('seller1@bookstore.test', '9789330074547', 'The Lion, the Witch and the Wardrobe', 'Portal Fantasy', 32900, 35, 'English', 'Four children push past the coats in a wardrobe and find a snowbound land waiting for a king.', 'approved', ARRAY['C.S. Lewis']),
    ('seller1@bookstore.test', '9789330037276', 'Through the Looking-Glass', 'Portal Fantasy', 24900, 28, 'English', 'Alice steps through a mirror into a living chessboard where everything runs backwards.', 'approved', ARRAY['Lewis Carroll']),
    ('seller1@bookstore.test', '9789330000003', 'Alice''s Adventures in Wonderland', 'Portal Fantasy', 24900, 40, 'English', 'A girl follows a waistcoated rabbit down a hole into a world where logic goes out to tea.', 'approved', ARRAY['Lewis Carroll']),
    ('seller2@bookstore.test', '9789331155375', 'Hans Christian Andersen''s Fairy Tales', 'Classic Fairy Tales', 29900, 30, 'English', 'The Little Mermaid, the Snow Queen and the Emperor''s new clothes, in one fat volume.', 'approved', ARRAY['Hans Christian Andersen']),
    ('seller2@bookstore.test', '9789331118103', 'Grimms'' Fairy Tales', 'Classic Fairy Tales', 29900, 37, 'English', 'Hansel, Rapunzel, Snow White and two hundred other tales gathered from the firesides of Germany.', 'approved', ARRAY['Jacob Grimm','Wilhelm Grimm']),
    ('seller2@bookstore.test', '9789331080837', 'The Bear and the Nightingale', 'Retellings', 39900, 12, 'English', 'In a snowbound Russian village a girl who sees the household spirits stands against a fearful new priest.', 'approved', ARRAY['Katherine Arden']),
    ('seller2@bookstore.test', '9789331043566', 'Spinning Silver', 'Retellings', 42900, 13, 'English', 'A moneylender''s daughter boasts she can turn silver into gold and attracts the notice of the Staryk king.', 'approved', ARRAY['Naomi Novik']),
    ('seller2@bookstore.test', '9789331006295', 'Uprooted', 'Retellings', 42900, 14, 'English', 'A village girl is taken by a wizard to his tower and discovers a magic of her own to fight the haunted Wood.', 'approved', ARRAY['Naomi Novik']),
    ('seller2@bookstore.test', '9789330969027', 'Norse Mythology', 'Norse', 39900, 25, 'English', 'Thor, Loki and Odin retold with wit: how the gods got their treasures and how their world ends.', 'approved', ARRAY['Neil Gaiman']),
    ('seller2@bookstore.test', '9789330931758', 'Percy Jackson and the Lightning Thief', 'Young Adult Fantasy', 34900, 41, 'English', 'A twelve-year-old discovers his father is a Greek god and is blamed for stealing Zeus''s thunderbolt.', 'approved', ARRAY['Rick Riordan']),
    ('seller2@bookstore.test', '9789330894480', 'Circe', 'Greek and Roman', 42900, 19, 'English', 'The witch of Aiaia tells her own story, from the halls of the gods to an island of lions and herbs.', 'approved', ARRAY['Madeline Miller']),
    ('seller2@bookstore.test', '9789331938046', 'Quick Spells for Busy Wizards', 'Cozy Fantasy', 24900, 10, 'English', 'Sample listing that moderation rejected.', 'rejected', ARRAY['Demo Author']),
    ('seller1@bookstore.test', '9789331528070', 'The Worst Witch', 'Adventure and Magic', 24900, 27, 'English', 'Mildred Hubble is the clumsiest girl at Miss Cackle''s Academy for witches, and cannot stop having adventures.', 'approved', ARRAY['Jill Murphy']),
    ('seller1@bookstore.test', '9789331490803', 'Wyrd Sisters', 'Humorous Fantasy', 34900, 17, 'English', 'Three witches on a blasted heath try to save a kingdom and put on a play.', 'approved', ARRAY['Terry Pratchett']),
    ('seller1@bookstore.test', '9789331453532', 'Harry Potter and the Chamber of Secrets', 'Adventure and Magic', 39900, 48, 'English', 'A second year at Hogwarts brings whispers in the walls and a diary that writes back.', 'approved', ARRAY['J.K. Rowling']),
    ('seller1@bookstore.test', '9789331416261', 'Harry Potter and the Philosopher''s Stone', 'Adventure and Magic', 39900, 60, 'English', 'An orphan discovers he is a wizard and starts at a school of magic.', 'approved', ARRAY['J.K. Rowling']),
    ('seller1@bookstore.test', '9789331378996', 'Howl''s Moving Castle', 'Young Adult Fantasy', 34900, 32, 'English', 'Cursed into an old woman''s body, Sophie becomes the cleaner of a wizard''s walking castle.', 'approved', ARRAY['Diana Wynne Jones']),
    ('seller1@bookstore.test', '9789331341723', 'A Wizard of Earthsea', 'Epic and High Fantasy', 34900, 20, 'English', 'A proud young mage lets loose a shadow that follows him across a sea of islands.', 'approved', ARRAY['Ursula K. Le Guin']),
    ('seller2@bookstore.test', '9789331304452', 'Kiki''s Delivery Service', 'Cozy Fantasy', 31900, 22, 'English', 'A thirteen-year-old witch leaves home on her broom with a black cat and starts a delivery business by the sea.', 'approved', ARRAY['Eiko Kadono']),
    ('seller2@bookstore.test', '9789331267184', 'Practical Magic', 'Urban and Contemporary Fantasy', 34900, 18, 'English', 'Two sisters raised by their eccentric aunts try to outrun a family curse in a town that whispers.', 'approved', ARRAY['Alice Hoffman']),
    ('seller2@bookstore.test', '9789331229915', 'The House in the Cerulean Sea', 'Cozy Fantasy', 39900, 29, 'English', 'A caseworker is sent to inspect an island orphanage for magical children and ends up wanting to stay.', 'approved', ARRAY['TJ Klune']),
    ('seller2@bookstore.test', '9789331192646', 'Legends & Lattes', 'Cozy Fantasy', 37900, 36, 'English', 'A retired orc adventurer hangs up her sword and opens the first coffee shop in a city that has never heard of coffee.', 'approved', ARRAY['Travis Baldree']),
    ('seller2@bookstore.test', '9789330857218', 'Redwall', 'Animal Stories', 32900, 15, 'English', 'A young mouse takes up a legendary sword to defend a peaceful abbey from a one-eyed rat warlord.', 'approved', ARRAY['Brian Jacques']),
    ('seller2@bookstore.test', '9789330819940', 'The Wind in the Willows', 'Classics', 24900, 29, 'English', 'A Mole, a Rat, a Badger and a very reckless Toad share a river bank and a great many picnics.', 'approved', ARRAY['Kenneth Grahame']),
    ('seller2@bookstore.test', '9789330782671', 'The Last Unicorn', 'Epic and High Fantasy', 34900, 4, 'English', 'A unicorn learns she may be the last of her kind and sets out to find where the rest have gone.', 'approved', ARRAY['Peter S. Beagle']),
    ('seller2@bookstore.test', '9789330745409', 'Peter Pan', 'Classics', 22900, 34, 'English', 'Second star to the right and straight on till morning brings three children to Neverland.', 'approved', ARRAY['J.M. Barrie']),
    ('seller2@bookstore.test', '9789330708138', 'The Little Prince', 'Classics', 22900, 52, 'English', 'A pilot stranded in the desert meets a small traveller from a tiny planet with one proud rose.', 'approved', ARRAY['Antoine de Saint-Exupery']),
    ('seller2@bookstore.test', '9789330670862', 'Stardust', 'Portal Fantasy', 32900, 31, 'English', 'A young man crosses a wall into Faerie to fetch a fallen star, and finds she is a good deal more than a star.', 'approved', ARRAY['Neil Gaiman']);

INSERT INTO authors (name)
SELECT DISTINCT a FROM seed_books, unnest(authors) AS a
ON CONFLICT (name) DO NOTHING;

INSERT INTO books (seller_id, category_id, isbn, title, description, language, price_cents, stock, status, rejection_reason)
SELECT u.user_id, c.category_id, s.isbn, s.title, s.description, s.language, s.price_cents, s.stock, s.status,
       CASE WHEN s.status = 'rejected' THEN 'ISBN could not be verified' END
  FROM seed_books s
  JOIN users u      ON u.email = s.seller_email
  JOIN categories c ON c.name  = s.category
 ORDER BY s.n;

INSERT INTO book_authors (book_id, author_id, author_order)
SELECT b.book_id, a.author_id, x.ord
  FROM seed_books s
  JOIN books b ON b.isbn = s.isbn
  CROSS JOIN LATERAL unnest(s.authors) WITH ORDINALITY AS x(author_name, ord)
  JOIN authors a ON a.name = x.author_name;

INSERT INTO stock_movements (book_id, delta, reason, created_by)
SELECT book_id, stock, 'restock', seller_id FROM books WHERE stock > 0;
DROP TABLE seed_books;
